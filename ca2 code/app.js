
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
 
const app = express();
<<<<<<< HEAD


// ---------- Database connection ----------
=======
 
// ============================================================
// Database connection
// ============================================================
 
>>>>>>> 9d8cbf2535e7ef599a1dbde1fbad5b2923f2ad61
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

    db.query('ALTER TABLE bookings ADD COLUMN cancelled_by VARCHAR(20) NULL', (err) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('cancelled_by column already exists - skipping.');
            } else {
                console.error('Could not ensure booking cancellation tracking column:', err.message);
            }
        } else {
            console.log('cancelled_by column added.');
        }
    });

    db.query("ALTER TABLE bookings MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'confirmed'", (err) => {
        if (err) {
            console.error('Could not widen bookings.status column:', err.message);
        } else {
            console.log('bookings.status column is ready.');
        }
    });
});
 
// ============================================================
// App-level middleware
// ============================================================
 
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
 
// Makes flash messages and the logged-in user available to every view
// automatically, so individual routes don't need to pass them by hand.
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});
 
// Seat-class price multiplier - the core of the booking price enhancement.
// economy = base price, business = 2x, first = 3x.
const CLASS_MULTIPLIER = { economy: 1, business: 2, first: 3 };
function getMultiplier(seatClass) {
    return CLASS_MULTIPLIER[seatClass] || 1;
}
 
// ============================================================
// Student A - Access control middleware
// ============================================================
 
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
 
// ============================================================
// Public routes
// ============================================================
 
app.get('/', (req, res) => {
    res.render('index');
});
 
// ---------- Student A: Registration ----------
 
app.get('/register', (req, res) => {
    res.render('register');
});
 
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact } = req.body;
    // Public registration is always for customers - admin accounts are
    // seeded directly in the database, not self-registered.
    const role = 'customer';
 
    const checkSql = 'SELECT id FROM users WHERE email = ?';
    db.query(checkSql, [email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.flash('error', 'An account with that email already exists.');
            return res.redirect('/register');
        }
 
        const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
        db.query(sql, [username, email, password, address, contact, role], (err) => {
            if (err) throw err;
            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        });
    });
});
 
// ---------- Student A: Login / Logout ----------
 
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
 
        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
 
        req.session.user = results[0];
        req.flash('success', 'Login successful!');
        res.redirect(results[0].role === 'admin' ? '/admin' : '/dashboard');
    });
});
 
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});
 
// ============================================================
// Customer routes
// ============================================================
 
// ---------- Student C + Student F: Browse / Search / Filter / Sort flights ----------
 
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
 
    if (sort === 'price_asc') sql += ' ORDER BY price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
    else sql += ' ORDER BY departure_date ASC'; // covers 'date_asc' and no sort given
 
    db.query(sql, params, (err, flights) => {
        if (err) throw err;
        res.render('dashboard', {
            flights,
            query: { destination: destination || '', date: date || '', sort: sort || '' }
        });
    });
});
 
// ---------- Student B: Create booking (+ seat inventory check) ----------
 
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
<<<<<<< HEAD
    const {first_name, last_name, passenger_number, passenger_gender,passenger_email,passenger_passport,passenger_dob,fare } = req.body;

    if (!first_name || !last_name || !passenger_number || !passenger_gender || !passenger_email || !passenger_passport || !passenger_dob || !fare) {
=======
    const { passenger_name, seat_class } = req.body;
    const passengerCount = parseInt(req.body.passenger_count, 10);
 
    if (!passenger_name || !passengerCount || passengerCount < 1) {
>>>>>>> 9d8cbf2535e7ef599a1dbde1fbad5b2923f2ad61
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
 
        // Enhancement: seat inventory check - never trust the client, block overbooking.
        if (passengerCount > flight.available_seats) {
            req.flash('error', `Only ${flight.available_seats} seat(s) left on this flight.`);
            return res.redirect(`/book/${flightId}`);
        }
 
        const totalPrice = flight.price * passengerCount * getMultiplier(seat_class);
 
        const insertSql = `INSERT INTO bookings (user_id, flight_id, passenger_name, passenger_count, seat_class, total_price, status)
                            VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`;
        db.query(insertSql, [req.session.user.id, flightId, passenger_name, passengerCount, seat_class, totalPrice], (err) => {
            if (err) throw err;
 
            // Enhancement: decrement available seats after a successful booking.
            const updateSeatsSql = 'UPDATE flights SET available_seats = available_seats - ? WHERE id = ?';
            db.query(updateSeatsSql, [passengerCount, flightId], (err) => {
                if (err) throw err;
                req.flash('success', 'Flight booked successfully!');
                res.redirect('/my-bookings');
            });
        });
    });
});
 
// ---------- Student C: View my bookings ----------
 
app.get('/my-bookings', checkAuthenticated, checkCustomer, (req, res) => {
    const sql = `SELECT bookings.*,
                        COALESCE(flights.flight_number, 'Removed flight') AS flight_number,
                        COALESCE(flights.origin, 'N/A') AS origin,
                        COALESCE(flights.destination, 'N/A') AS destination,
                        flights.departure_date, flights.departure_time
                 FROM bookings
                 LEFT JOIN flights ON bookings.flight_id = flights.id
                 WHERE bookings.user_id = ?
                 ORDER BY bookings.booking_date DESC`;
    db.query(sql, [req.session.user.id], (err, bookings) => {
        if (err) throw err;
        res.render('my-bookings', { bookings });
    });
});
 
// ---------- Student D: Edit booking (+ seat inventory adjustment) ----------
 
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
 
        const booking = results[0];
        if (booking.status !== 'confirmed') {
            req.flash('error', 'This booking cannot be edited.');
            return res.redirect('/my-bookings');
        }
 
        res.render('edit-booking', { booking });
    });
});
 
app.post('/bookings/edit/:id', checkAuthenticated, checkCustomer, (req, res) => {
    const bookingId = req.params.id;
    const { passenger_name, seat_class } = req.body;
    const newCount = parseInt(req.body.passenger_count, 10);
 
    if (!passenger_name || !newCount || newCount < 1) {
        req.flash('error', 'Please provide valid passenger details.');
        return res.redirect(`/bookings/edit/${bookingId}`);
    }
 
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
        if (booking.status !== 'confirmed') {
            req.flash('error', 'This booking cannot be edited.');
            return res.redirect('/my-bookings');
        }
 
        const seatDelta = newCount - booking.passenger_count; // positive = needs more seats
 
        // Enhancement: check the flight still has enough seats before applying the change.
        if (seatDelta > 0 && seatDelta > booking.available_seats) {
            req.flash('error', 'Not enough seats available for this change.');
            return res.redirect(`/bookings/edit/${bookingId}`);
        }
 
        const newTotalPrice = booking.price * newCount * getMultiplier(seat_class);
 
        const updateBookingSql = `UPDATE bookings SET passenger_name = ?, passenger_count = ?, seat_class = ?, total_price = ?
                                   WHERE id = ?`;
        db.query(updateBookingSql, [passenger_name, newCount, seat_class, newTotalPrice, bookingId], (err) => {
            if (err) throw err;
 
            // Enhancement: adjust the flight's available seats by the delta.
            const updateSeatsSql = 'UPDATE flights SET available_seats = available_seats - ? WHERE id = ?';
            db.query(updateSeatsSql, [seatDelta, booking.flight_id], (err) => {
                if (err) throw err;
                req.flash('success', 'Booking updated successfully!');
                res.redirect('/my-bookings');
            });
        });
    });
});
 
// ---------- Student E: Cancel booking (+ seat restore) ----------
 
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
        if (booking.status === 'cancelled') {
            req.flash('error', 'Booking is already cancelled.');
            return res.redirect('/my-bookings');
        }
        if (booking.status === 'flight removed') {
            req.flash('error', 'This booking can no longer be cancelled because the flight was removed.');
            return res.redirect('/my-bookings');
        }
 
        db.query('UPDATE bookings SET status = ?, cancelled_by = ? WHERE id = ?', ['cancelled', 'customer', bookingId], (err) => {
            if (err) throw err;
 
            const restoreSeatsSql = 'UPDATE flights SET available_seats = available_seats + ? WHERE id = ?';
            db.query(restoreSeatsSql, [booking.passenger_count, booking.flight_id], (err) => {
                if (err) throw err;
                req.flash('success', 'Booking cancelled and seats released.');
                res.redirect('/my-bookings');
            });
        });
    });
});
 
// ============================================================
// Admin routes
// ============================================================
 
// ---------- Student C + Student F: Admin view / search / filter / sort flights ----------
 
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
 
    if (sort === 'price_asc') sql += ' ORDER BY price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
    else sql += ' ORDER BY departure_date ASC';
 
    db.query(sql, params, (err, flights) => {
        if (err) throw err;
        res.render('admin', { flights, query: { destination: destination || '', date: date || '', sort: sort || '' } });
    });
});
 
// ---------- Student B: Admin add flight ----------
 
app.get('/admin/flights/add', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin-add-flight');
});
 
app.post('/admin/flights/add', checkAuthenticated, checkAdmin, (req, res) => {
    const { flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats } = req.body;
 
    if (!flight_number || !airline || !origin || !destination || !departure_date || !departure_time || !arrival_time || !price || !total_seats) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/admin/flights/add');
    }
 
    if (parseFloat(price) < 50 || parseInt(total_seats, 10) < 1) {
        req.flash('error', 'Price must be at least $50 and seats at least 1.');
        return res.redirect('/admin/flights/add');
    }
 
    const sql = `INSERT INTO flights (flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, available_seats)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, total_seats], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'That flight number already exists.');
                return res.redirect('/admin/flights/add');
            }
            throw err;
        }
        req.flash('success', 'Flight added successfully!');
        res.redirect('/admin');
    });
});
 
// ---------- Student D: Admin edit flight ----------
 
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
 
    // Fetch the current booked-seat count so available_seats stays
    // consistent if total_seats changes (see README for the reasoning).
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
 
// ---------- Student E: Admin delete flight ----------
 
app.post('/admin/flights/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const flightId = req.params.id;
 
    // Mark any still-confirmed bookings on this flight as removed before
    // deleting the flight itself, so passengers can see what happened
    // instead of the booking silently disappearing.
    const markRemovedSql = "UPDATE bookings SET status = 'flight removed' WHERE flight_id = ? AND status = 'confirmed'";
    db.query(markRemovedSql, [flightId], (err) => {
        if (err) throw err;
 
        db.query('DELETE FROM flights WHERE id = ?', [flightId], (err) => {
            if (err) throw err;
            req.flash('success', 'Flight deleted successfully!');
            res.redirect('/admin');
        });
    });
});
 
// ---------- Student C: Admin view all bookings ----------
 
app.get('/admin/bookings', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = `SELECT bookings.*, users.username, users.email,
                        COALESCE(flights.flight_number, 'Removed flight') AS flight_number,
                        COALESCE(flights.origin, 'N/A') AS origin,
                        COALESCE(flights.destination, 'N/A') AS destination,
                        flights.departure_date
                 FROM bookings
                 JOIN users ON bookings.user_id = users.id
                 LEFT JOIN flights ON bookings.flight_id = flights.id
                 ORDER BY bookings.booking_date DESC`;
    db.query(sql, (err, bookings) => {
        if (err) throw err;
        res.render('admin-bookings', { bookings });
    });
});
<<<<<<< HEAD


/* add passenger*/ 
app.get("/book/:id", (req, res) => {
    const id = req.params.id;
    db.query(
        "SELECT * FROM flights WHERE id = ?",
        [id],
        (err, results) => {
            if (err) throw err;
            res.render("book", {
                flight: results[0]
            });
        }
    );
});



// Starting the server
=======
 
// ---------- Student E: Admin cancel booking ----------
 
app.post('/admin/bookings/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookingId = req.params.id;
 
    db.query('SELECT * FROM bookings WHERE id = ?', [bookingId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Booking not found');
 
        const booking = results[0];
        if (booking.status === 'cancelled') {
            req.flash('error', 'Booking is already cancelled.');
            return res.redirect('/admin/bookings');
        }
        if (booking.status === 'flight removed') {
            req.flash('error', 'This booking is already marked as flight removed.');
            return res.redirect('/admin/bookings');
        }
 
        db.query('UPDATE bookings SET status = ?, cancelled_by = ? WHERE id = ?', ['cancelled', 'admin', bookingId], (err) => {
            if (err) throw err;
 
            db.query('UPDATE flights SET available_seats = available_seats + ? WHERE id = ?',
                [booking.passenger_count, booking.flight_id], (err) => {
                    if (err) throw err;
                    req.flash('success', 'Booking cancelled by admin.');
                    res.redirect('/admin/bookings');
                });
        });
    });
});
 
// ---------- Student E: Admin reactivate booking ----------
 
app.post('/admin/bookings/reactivate/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookingId = req.params.id;
 
    db.query('SELECT * FROM bookings WHERE id = ?', [bookingId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.status(404).send('Booking not found');
 
        const booking = results[0];
 
        // Only bookings the admin cancelled can be reactivated this way -
        // not ones the customer cancelled, and not ones whose flight was removed.
        if (booking.status !== 'cancelled' || booking.cancelled_by !== 'admin') {
            req.flash('error', 'This booking cannot be reactivated.');
            return res.redirect('/admin/bookings');
        }
 
        if (!booking.flight_id) {
            req.flash('error', 'Cannot reactivate - the flight for this booking no longer exists.');
            return res.redirect('/admin/bookings');
        }
 
        db.query('SELECT available_seats FROM flights WHERE id = ?', [booking.flight_id], (err, flightResults) => {
            if (err) throw err;
            if (flightResults.length === 0) {
                req.flash('error', 'Cannot reactivate - the flight for this booking no longer exists.');
                return res.redirect('/admin/bookings');
            }
 
            const flight = flightResults[0];
 
            // Seats were given back when this was cancelled - taking them
            // again might not be possible if other bookings filled the flight since.
            if (booking.passenger_count > flight.available_seats) {
                req.flash('error', `Cannot reactivate - only ${flight.available_seats} seat(s) left on this flight now.`);
                return res.redirect('/admin/bookings');
            }
 
            db.query('UPDATE bookings SET status = ?, cancelled_by = ? WHERE id = ?', ['confirmed', null, bookingId], (err) => {
                if (err) throw err;
 
                db.query('UPDATE flights SET available_seats = available_seats - ? WHERE id = ?',
                    [booking.passenger_count, booking.flight_id], (err) => {
                        if (err) throw err;
                        req.flash('success', 'Booking reactivated.');
                        res.redirect('/admin/bookings');
                    });
            });
        });
    });
});
 
// ============================================================
// Start server
// ============================================================
 
>>>>>>> 9d8cbf2535e7ef599a1dbde1fbad5b2923f2ad61
app.listen(3000, () => {
    console.log('SkyWings server started on http://localhost:3000');
}); 