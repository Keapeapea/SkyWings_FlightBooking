const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// ---------- Database connection ----------
const db = mysql.createConnection({
    host: 'c237-adib-mysql.mysql.database.azure.com',
    user: 'c237_019',
    password: 'c237019@2026!',
    database: 'c237_019_team4_CA2',
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to c237_019_team4_CA2 database.');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: 'c237_019_team4_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

app.use(flash());

app.set('view engine', 'ejs');

// make flash messages and logged-in user available to every view automatically
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// =====================================================
// STUDENT A - Access Control Middleware
// =====================================================
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to view this resource.');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied. Admins only.');
    res.redirect('/dashboard');
};

const checkCustomer = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'customer') {
        return next();
    }
    req.flash('error', 'Access denied. Customers only.');
    res.redirect('/admin');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password must be at least 6 characters long.');
        return res.redirect('/register');
    }

    next();
};

// =====================================================
// PUBLIC ROUTES
// =====================================================
app.get('/', (req, res) => {
    res.render('index');
});

// ---------- STUDENT A: Registration ----------
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact } = req.body;
    // public registration is always for customers; admin accounts are seeded directly in the DB
    const role = 'customer';

    const checkSql = 'SELECT id FROM users WHERE email = ?';
    db.query(checkSql, [email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.flash('error', 'An account with that email already exists.');
            return res.redirect('/register');
        }

        const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
        db.query(sql, [username, email, password, address, contact, role], (err, result) => {
            if (err) throw err;
            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    });
});

// ---------- STUDENT A: Login / Logout ----------
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    db.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            if (results[0].role === 'admin') {
                return res.redirect('/admin');
            }
            return res.redirect('/dashboard');
        }
        req.flash('error', 'Invalid email or password.');
        res.redirect('/login');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// =====================================================
// CUSTOMER ROUTES
// =====================================================

// ---------- STUDENT C + STUDENT F: View & Search/Filter/Sort Flights ----------
app.get('/dashboard', checkAuthenticated, checkCustomer, (req, res) => {
    const { destination, date, sort } = req.query;

    let sql = 'SELECT * FROM flights WHERE available_seats > 0';
    const params = [];

    if (destination) {
        sql += ' AND destination LIKE ?';
        params.push(`%${destination}%`);
    }
    if (date) {
        sql += ' AND departure_date = ?';
        params.push(date);
    }

    if (sort === 'price_asc') {
        sql += ' ORDER BY price ASC';
    } else if (sort === 'price_desc') {
        sql += ' ORDER BY price DESC';
    } else if (sort === 'date_asc') {
        sql += ' ORDER BY departure_date ASC';
    } else {
        sql += ' ORDER BY departure_date ASC';
    }

    db.query(sql, params, (err, flights) => {
        if (err) throw err;
        res.render('dashboard', {
            flights,
            query: { destination: destination || '', date: date || '', sort: sort || '' }
        });
    });
});

// ---------- STUDENT B: Create Booking (+ enhancement: seat inventory check) ----------
app.get('/book/:flightId', checkAuthenticated, checkCustomer, (req, res) => {
    const sql = 'SELECT * FROM flights WHERE id = ?';
    db.query(sql, [req.params.flightId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Flight not found.');
            return res.redirect('/dashboard');
        }
        res.render('book', { flight: results[0] });
    });
});

app.post('/book/:flightId', checkAuthenticated, checkCustomer, (req, res) => {
    const flightId = req.params.flightId;
    const { passenger_name, passenger_count, seat_class } = req.body;
    const passengerCount = parseInt(passenger_count, 10);

    if (!passenger_name || !passengerCount || passengerCount < 1) {
        req.flash('error', 'Please provide valid passenger details.');
        return res.redirect(`/book/${flightId}`);
    }

    const flightSql = 'SELECT * FROM flights WHERE id = ?';
    db.query(flightSql, [flightId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Flight not found.');
            return res.redirect('/dashboard');
        }

        const flight = results[0];

        // Enhancement: seat inventory check - prevent overbooking
        if (passengerCount > flight.available_seats) {
            req.flash('error', `Only ${flight.available_seats} seat(s) left on this flight.`);
            return res.redirect(`/book/${flightId}`);
        }

        const classMultiplier = seat_class === 'business' ? 2 : seat_class === 'first' ? 3 : 1;
        const totalPrice = flight.price * passengerCount * classMultiplier;

        const insertSql = `INSERT INTO bookings (user_id, flight_id, passenger_name, passenger_count, seat_class, total_price)
                            VALUES (?, ?, ?, ?, ?, ?)`;
        db.query(insertSql, [req.session.user.id, flightId, passenger_name, passengerCount, seat_class, totalPrice], (err) => {
            if (err) throw err;

            // Enhancement: decrement available seats after successful booking
            const updateSeatsSql = 'UPDATE flights SET available_seats = available_seats - ? WHERE id = ?';
            db.query(updateSeatsSql, [passengerCount, flightId], (err) => {
                if (err) throw err;
                req.flash('success', 'Flight booked successfully!');
                res.redirect('/my-bookings');
            });
        });
    });
});

// ---------- STUDENT C: View My Bookings ----------
app.get('/my-bookings', checkAuthenticated, checkCustomer, (req, res) => {
    const sql = `SELECT bookings.*, flights.flight_number, flights.origin, flights.destination,
                        flights.departure_date, flights.departure_time
                 FROM bookings
                 JOIN flights ON bookings.flight_id = flights.id
                 WHERE bookings.user_id = ?
                 ORDER BY bookings.booking_date DESC`;
    db.query(sql, [req.session.user.id], (err, bookings) => {
        if (err) throw err;
        res.render('my-bookings', { bookings });
    });
});

// ---------- STUDENT D: Edit Booking (+ enhancement: seat inventory adjustment) ----------
app.get('/bookings/edit/:id', checkAuthenticated, checkCustomer, (req, res) => {
    const sql = `SELECT bookings.*, flights.flight_number, flights.origin, flights.destination,
                        flights.price, flights.available_seats
                 FROM bookings JOIN flights ON bookings.flight_id = flights.id
                 WHERE bookings.id = ? AND bookings.user_id = ?`;
    db.query(sql, [req.params.id, req.session.user.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Booking not found.');
            return res.redirect('/my-bookings');
        }
        res.render('edit-booking', { booking: results[0] });
    });
});

app.post('/bookings/edit/:id', checkAuthenticated, checkCustomer, (req, res) => {
    const bookingId = req.params.id;
    const { passenger_name, passenger_count, seat_class } = req.body;
    const newCount = parseInt(passenger_count, 10);

    const sql = `SELECT bookings.*, flights.id AS flight_id, flights.price, flights.available_seats
                 FROM bookings JOIN flights ON bookings.flight_id = flights.id
                 WHERE bookings.id = ? AND bookings.user_id = ?`;
    db.query(sql, [bookingId, req.session.user.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Booking not found.');
            return res.redirect('/my-bookings');
        }

        const booking = results[0];
        const seatDelta = newCount - booking.passenger_count; // +ve = needs more seats

        // Enhancement: check flight still has enough available seats before applying the change
        if (seatDelta > 0 && seatDelta > booking.available_seats) {
            req.flash('error', 'Not enough seats available for this change.');
            return res.redirect(`/bookings/edit/${bookingId}`);
        }

        const classMultiplier = seat_class === 'business' ? 2 : seat_class === 'first' ? 3 : 1;
        const newTotalPrice = booking.price * newCount * classMultiplier;

        const updateBookingSql = `UPDATE bookings SET passenger_name = ?, passenger_count = ?, seat_class = ?, total_price = ?
                                   WHERE id = ?`;
        db.query(updateBookingSql, [passenger_name, newCount, seat_class, newTotalPrice, bookingId], (err) => {
            if (err) throw err;

            // Enhancement: adjust flight's available seats by the delta
            const updateSeatsSql = 'UPDATE flights SET available_seats = available_seats - ? WHERE id = ?';
            db.query(updateSeatsSql, [seatDelta, booking.flight_id], (err) => {
                if (err) throw err;
                req.flash('success', 'Booking updated successfully!');
                res.redirect('/my-bookings');
            });
        });
    });
});

// ---------- STUDENT E: Cancel/Delete Booking (+ enhancement: seat restore) ----------
app.post('/bookings/delete/:id', checkAuthenticated, checkCustomer, (req, res) => {
    const bookingId = req.params.id;

    const sql = 'SELECT * FROM bookings WHERE id = ? AND user_id = ?';
    db.query(sql, [bookingId, req.session.user.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Booking not found.');
            return res.redirect('/my-bookings');
        }

        const booking = results[0];

        const deleteSql = 'DELETE FROM bookings WHERE id = ?';
        db.query(deleteSql, [bookingId], (err) => {
            if (err) throw err;

            // Enhancement: restore the seats back to the flight's available inventory
            const restoreSeatsSql = 'UPDATE flights SET available_seats = available_seats + ? WHERE id = ?';
            db.query(restoreSeatsSql, [booking.passenger_count, booking.flight_id], (err) => {
                if (err) throw err;
                req.flash('success', 'Booking cancelled and seats released.');
                res.redirect('/my-bookings');
            });
        });
    });
});

// =====================================================
// ADMIN ROUTES
// =====================================================

// ---------- STUDENT C + STUDENT F: Admin View / Search / Filter / Sort Flights ----------
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const { destination, date, sort } = req.query;

    let sql = 'SELECT * FROM flights WHERE 1=1';
    const params = [];

    if (destination) {
        sql += ' AND destination LIKE ?';
        params.push(`%${destination}%`);
    }
    if (date) {
        sql += ' AND departure_date = ?';
        params.push(date);
    }

    if (sort === 'price_asc') {
        sql += ' ORDER BY price ASC';
    } else if (sort === 'price_desc') {
        sql += ' ORDER BY price DESC';
    } else {
        sql += ' ORDER BY departure_date ASC';
    }

    db.query(sql, params, (err, flights) => {
        if (err) throw err;
        res.render('admin', { flights, query: { destination: destination || '', date: date || '', sort: sort || '' } });
    });
});

// ---------- STUDENT B: Admin Add Flight ----------
app.get('/admin/flights/add', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin-add-flight');
});

app.post('/admin/flights/add', checkAuthenticated, checkAdmin, (req, res) => {
    const { flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats } = req.body;

    if (!flight_number || !airline || !origin || !destination || !departure_date || !departure_time || !arrival_time || !price || !total_seats) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/admin/flights/add');
    }

    const sql = `INSERT INTO flights (flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, available_seats)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, total_seats], (err) => {
        if (err) throw err;
        req.flash('success', 'Flight added successfully!');
        res.redirect('/admin');
    });
});

// ---------- STUDENT D: Admin Edit Flight ----------
app.get('/admin/flights/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'SELECT * FROM flights WHERE id = ?';
    db.query(sql, [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Flight not found.');
            return res.redirect('/admin');
        }
        res.render('admin-edit-flight', { flight: results[0] });
    });
});

app.post('/admin/flights/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats } = req.body;

    // fetch current booked seats so available_seats stays consistent if total_seats changes
    const currentSql = 'SELECT total_seats, available_seats FROM flights WHERE id = ?';
    db.query(currentSql, [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Flight not found.');
            return res.redirect('/admin');
        }

        const current = results[0];
        const bookedSeats = current.total_seats - current.available_seats;
        const newAvailable = Math.max(total_seats - bookedSeats, 0);

        const sql = `UPDATE flights SET flight_number = ?, airline = ?, origin = ?, destination = ?, departure_date = ?,
                     departure_time = ?, arrival_time = ?, price = ?, total_seats = ?, available_seats = ? WHERE id = ?`;
        db.query(sql, [flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, newAvailable, req.params.id], (err) => {
            if (err) throw err;
            req.flash('success', 'Flight updated successfully!');
            res.redirect('/admin');
        });
    });
});

// ---------- STUDENT E: Admin Delete Flight ----------
app.post('/admin/flights/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'DELETE FROM flights WHERE id = ?';
    db.query(sql, [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Flight deleted successfully!');
        res.redirect('/admin');
    });
});

// ---------- STUDENT C: Admin View All Bookings ----------
app.get('/admin/bookings', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = `SELECT bookings.*, users.username, users.email, flights.flight_number,
                        flights.origin, flights.destination, flights.departure_date
                 FROM bookings
                 JOIN users ON bookings.user_id = users.id
                 JOIN flights ON bookings.flight_id = flights.id
                 ORDER BY bookings.booking_date DESC`;
    db.query(sql, (err, bookings) => {
        if (err) throw err;
        res.render('admin-bookings', { bookings });
    });
});

// Starting the server
app.listen(3000, () => {
    console.log('SkyWings server started on http://localhost:3000');
});
