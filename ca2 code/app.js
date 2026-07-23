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

    db.query('ALTER TABLE bookings ADD COLUMN seat_numbers VARCHAR(255) NULL', (err) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('seat_numbers column already exists - skipping.');
            } else {
                console.error('Could not add bookings.seat_numbers column:', err.message);
            }
        } else {
            console.log('seat_numbers column added.');
        }
    });

    db.query(`CREATE TABLE IF NOT EXISTS seats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        flight_id INT NOT NULL,
        seat_number VARCHAR(5) NOT NULL,
        seat_class VARCHAR(20) NOT NULL,
        booking_id INT NULL,
        UNIQUE KEY uniq_flight_seat (flight_id, seat_number),
        FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    )`, (err) => {
        if (err) {
            console.error('Could not ensure seats table:', err.message);
        } else {
            console.log('seats table is ready.');
        }
    });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'skywings_secret_key',
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
 
// Seat-class price surcharge (flat, in SGD) - the core of the booking price enhancement.
// economy = no additional charge, business = +S$79.80/seat, first = +S$138.80/seat.
// Keep this in sync with SEAT_SURCHARGE in views/partials/seatmap.ejs.
const SEAT_SURCHARGE = { economy: 0, business: 79.80, first: 138.80 };
function getSeatSurcharge(seatClass) {
    return SEAT_SURCHARGE[seatClass] || 0;
}

// Maps the `fare` radio value from book.ejs to a seat class + per-person
// price multiplier. Keep these numbers in sync with the prices shown on
// the fare cards in book.ejs.
const FARE_INFO = {
    economy_basic:      { seatClass: 'economy',  multiplier: 1 },
    economy_standard:   { seatClass: 'economy',  multiplier: 1.15 },
    business_lite:      { seatClass: 'business', multiplier: 2 },
    business_standard:  { seatClass: 'business', multiplier: 2.5 }
};
function getFareInfo(fare) {
    return FARE_INFO[fare] || { seatClass: 'economy', multiplier: 1 };
}

// ---------- Seat map helpers ----------
// 6 seats per row (A-F). First 2 rows = first class, next 3 rows = business,
// remainder = economy. Adjust ratios here if your seat counts change.
const SEAT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function classForRow(rowNumber, totalRows) {
    const firstRows = Math.max(1, Math.round(totalRows * 0.1));
    const businessRows = Math.max(1, Math.round(totalRows * 0.2));
    if (rowNumber <= firstRows) return 'first';
    if (rowNumber <= firstRows + businessRows) return 'business';
    return 'economy';
}

// Generates and inserts seat rows for a newly created flight.
function generateSeatsForFlight(flightId, totalSeats, callback) {
    const totalRows = Math.ceil(totalSeats / SEAT_LETTERS.length);
    const seatRows = [];
    let seatsLeft = totalSeats;

    for (let row = 1; row <= totalRows && seatsLeft > 0; row++) {
        const seatClass = classForRow(row, totalRows);
        for (let i = 0; i < SEAT_LETTERS.length && seatsLeft > 0; i++) {
            seatRows.push([flightId, `${row}${SEAT_LETTERS[i]}`, seatClass, null]);
            seatsLeft--;
        }
    }

    if (seatRows.length === 0) return callback(null);

    const sql = 'INSERT INTO seats (flight_id, seat_number, seat_class, booking_id) VALUES ?';
    db.query(sql, [seatRows], callback);
}

// Fetches the full seat map for a flight, each seat flagged with whether
// it's taken, and (if editing) whether it belongs to the current booking.
function getSeatMap(flightId, currentBookingId, callback) {
    const sql = 'SELECT * FROM seats WHERE flight_id = ? ORDER BY seat_number';
    db.query(sql, [flightId], (err, seats) => {
        if (err) return callback(err);
        const seatMap = seats.map(s => ({
            ...s,
            row: parseInt(s.seat_number, 10),
            letter: s.seat_number.replace(/[0-9]/g, ''),
            taken: !!s.booking_id && s.booking_id !== currentBookingId,
            mine: !!currentBookingId && s.booking_id === currentBookingId
        }));
        callback(null, seatMap);
    });
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

// ---------- STUDENT A: Registration ----------
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

// ---------- Contact Us (public) ----------

app.get('/contact-us', (req, res) => {
    res.render('contact-us');
});

app.post('/contact-us', (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        req.flash('error', 'Please fill in every field before sending.');
        return res.redirect('/contact-us');
    }

    // No support-ticket table exists yet, so just acknowledge the message
    // for now - swap this for a real INSERT/email send when that's ready.
    console.log(`New contact message from ${name} <${email}>: ${message}`);
    req.flash('success', 'Thanks! Your message has been sent.');
    res.redirect('/contact-us');
});

// ---------- Profile (any logged-in user) ----------

app.get('/profile', checkAuthenticated, (req, res) => {
    res.render('profile');
});
 
// ============================================================
// Customer routes
// ============================================================
 
// ---------- One-time backfill: generate seats for flights that predate seat maps ----------
app.get('/admin/flights/backfill-seats', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = `SELECT f.id, f.total_seats FROM flights f
                 LEFT JOIN seats s ON s.flight_id = f.id
                 WHERE s.id IS NULL
                 GROUP BY f.id`;
    db.query(sql, (err, flights) => {
        if (err) throw err;
        if (flights.length === 0) {
            req.flash('success', 'Every flight already has a seat map.');
            return res.redirect('/admin');
        }

        let remaining = flights.length;
        let failed = [];

        flights.forEach(f => {
            generateSeatsForFlight(f.id, f.total_seats, (err) => {
                if (err) failed.push(f.id);
                remaining--;
                if (remaining === 0) {
                    req.flash('success', `Backfilled seats for ${flights.length - failed.length} flight(s).` +
                        (failed.length ? ` Failed: ${failed.join(', ')}` : ''));
                    res.redirect('/admin');
                }
            });
        });
    });
});

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
        getSeatMap(req.params.flightId, null, (err, seatMap) => {
            if (err) throw err;
            res.render('book', { flight: results[0], seatMap });
        });
    });
});
 
app.post('/book/:flightId', checkAuthenticated, checkCustomer, (req, res) => {
    const flightId = req.params.flightId;

    // With extended:true, name="first_name[]" etc. parse into arrays on
    // req.body.first_name / req.body.last_name / req.body.passenger_number.
    // Helper: always return an array, even if a field was omitted entirely.
    const asArray = (val) => (val === undefined ? [] : (Array.isArray(val) ? val : [val]));

    const firstNames   = asArray(req.body.first_name);
    const lastNames    = asArray(req.body.last_name);
    const genders      = asArray(req.body.passenger_gender);
    const emails       = asArray(req.body.passenger_email);
    const passports    = asArray(req.body.passenger_passport);
    const dobs         = asArray(req.body.passenger_dob);
    // passenger_number[] is used by BOTH the main passenger field and every
    // "+ Add" block, so this array already contains one entry per passenger.
    const numbers      = asArray(req.body.passenger_number);
    // passenger_name[] only exists for extra passengers added via the template.
    const extraNames   = asArray(req.body.passenger_name);
    const fare         = req.body.fare;
    const seatNumbers  = asArray(req.body.seat_numbers).filter(s => s && s.trim());

    const mainOk = firstNames[0] && lastNames[0] && genders[0] && emails[0] && passports[0] && dobs[0] && numbers[0];
    if (!mainOk || !fare) {
        req.flash('error', 'Please provide valid passenger details.');
        return res.redirect(`/book/${flightId}`);
    }

    // Total passenger count = the main passenger + however many extra
    // passenger blocks were added and actually filled in.
    const passengerCount = 1 + extraNames.filter(n => n && n.trim()).length;

    if (seatNumbers.length !== passengerCount) {
        req.flash('error', `Please select exactly ${passengerCount} seat(s) - one per passenger.`);
        return res.redirect(`/book/${flightId}`);
    }

    // Build one readable name string to store in the single passenger_name column.
    const allNames = [`${firstNames[0]} ${lastNames[0]}`, ...extraNames.filter(n => n && n.trim())];
    const passengerNames = allNames.join(', ');

    const { seatClass, multiplier } = getFareInfo(fare);

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

        // Confirm the chosen seats are still free right now (another
        // customer may have grabbed one since the page was loaded).
        const seatCheckSql = 'SELECT seat_number FROM seats WHERE flight_id = ? AND seat_number IN (?) AND booking_id IS NOT NULL';
        db.query(seatCheckSql, [flightId, seatNumbers], (err, takenRows) => {
            if (err) throw err;
            if (takenRows.length > 0) {
                req.flash('error', `Seat(s) ${takenRows.map(r => r.seat_number).join(', ')} were just taken. Please pick again.`);
                return res.redirect(`/book/${flightId}`);
            }

            // Total = base price x number of passengers x fare multiplier.
            const totalPrice = flight.price * passengerCount * multiplier;

            const insertSql = `INSERT INTO bookings (user_id, flight_id, passenger_name, passenger_count, seat_class, total_price, seat_numbers, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`;
            db.query(insertSql, [req.session.user.id, flightId, passengerNames, passengerCount, seatClass, totalPrice, seatNumbers.join(', ')], (err, insertResult) => {
                if (err) throw err;

                const bookingId = insertResult.insertId;

                // Claim the seats for this booking.
                const claimSeatsSql = 'UPDATE seats SET booking_id = ? WHERE flight_id = ? AND seat_number IN (?)';
                db.query(claimSeatsSql, [bookingId, flightId, seatNumbers], (err) => {
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
    const sql = `SELECT bookings.*, flights.id AS flight_id, flights.flight_number, flights.origin, flights.destination,
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

        // Seats already belonging to this booking show as "mine" (selectable/
        // deselectable) rather than "taken", everyone else's seats show as taken.
        getSeatMap(booking.flight_id, booking.id, (err, seatMap) => {
            if (err) throw err;
            res.render('edit-booking', { booking, seatMap });
        });
    });
});
 
app.post('/bookings/edit/:id', checkAuthenticated, checkCustomer, (req, res) => {
    const bookingId = req.params.id;
    const { passenger_name } = req.body;
    const asArray = (val) => (val === undefined ? [] : (Array.isArray(val) ? val : [val]));
    const seatNumbers = asArray(req.body.seat_numbers).filter(s => s && s.trim());
    const newCount = seatNumbers.length;
 
    if (!passenger_name || newCount < 1) {
        req.flash('error', 'Please provide a passenger name and select at least one seat.');
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

        // Make sure every selected seat is either free, or already this booking's own seat.
        const seatCheckSql = `SELECT seat_number, seat_class FROM seats
                               WHERE flight_id = ? AND seat_number IN (?)
                               AND (booking_id IS NULL OR booking_id = ?)`;
        db.query(seatCheckSql, [booking.flight_id, seatNumbers, bookingId], (err, freeRows) => {
            if (err) throw err;
            if (freeRows.length !== seatNumbers.length) {
                req.flash('error', 'One or more selected seats are no longer available. Please pick again.');
                return res.redirect(`/bookings/edit/${bookingId}`);
            }

            // All selected seats must share the same class, since a booking
            // stores one seat_class for the whole group.
            const classesUsed = [...new Set(freeRows.map(r => r.seat_class))];
            if (classesUsed.length > 1) {
                req.flash('error', 'Please select seats from a single class (Economy, Business, or First) only.');
                return res.redirect(`/bookings/edit/${bookingId}`);
            }
            const seatClass = classesUsed[0];
 
            // Each passenger pays the flight's base price plus a flat surcharge for their seat class.
            const newTotalPrice = newCount * (booking.price + getSeatSurcharge(seatClass));
 
            const updateBookingSql = `UPDATE bookings SET passenger_name = ?, passenger_count = ?, seat_class = ?, total_price = ?, seat_numbers = ?
                                       WHERE id = ?`;
            db.query(updateBookingSql, [passenger_name, newCount, seatClass, newTotalPrice, seatNumbers.join(', '), bookingId], (err) => {
                if (err) throw err;

                // Release this booking's old seats, then claim the newly selected ones.
                const releaseSql = 'UPDATE seats SET booking_id = NULL WHERE booking_id = ?';
                db.query(releaseSql, [bookingId], (err) => {
                    if (err) throw err;

                    const claimSql = 'UPDATE seats SET booking_id = ? WHERE flight_id = ? AND seat_number IN (?)';
                    db.query(claimSql, [bookingId, booking.flight_id, seatNumbers], (err) => {
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

            const releaseSeatsSql = 'UPDATE seats SET booking_id = NULL WHERE booking_id = ?';
            db.query(releaseSeatsSql, [bookingId], (err) => {
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
        req.flash('error', 'Price must be at least S$50 and seats at least 1.');
        return res.redirect('/admin/flights/add');
    }
 
    const sql = `INSERT INTO flights (flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, available_seats)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, total_seats], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'That flight number already exists.');
                return res.redirect('/admin/flights/add');
            }
            throw err;
        }
        generateSeatsForFlight(result.insertId, parseInt(total_seats, 10), (err) => {
            if (err) console.error('Could not generate seats for flight:', err.message);
            req.flash('success', 'Flight added successfully!');
            res.redirect('/admin');
        });
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

// ---------- Admin: Cancel any customer's booking (+ seat restore) ----------
// admin-bookings.ejs posts here for the "Cancel" button - this was referenced
// in the view but had no matching route.

app.post('/admin/bookings/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookingId = req.params.id;

    const sql = 'SELECT * FROM bookings WHERE id = ?';
    db.query(sql, [bookingId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Booking not found.');
            return res.redirect('/admin/bookings');
        }

        const booking = results[0];
        if (booking.status === 'cancelled') {
            req.flash('error', 'Booking is already cancelled.');
            return res.redirect('/admin/bookings');
        }
        if (booking.status === 'flight removed') {
            req.flash('error', 'This booking can no longer be cancelled because the flight was removed.');
            return res.redirect('/admin/bookings');
        }

        db.query('UPDATE bookings SET status = ?, cancelled_by = ? WHERE id = ?', ['cancelled', 'admin', bookingId], (err) => {
            if (err) throw err;

            const releaseSeatsSql = 'UPDATE seats SET booking_id = NULL WHERE booking_id = ?';
            db.query(releaseSeatsSql, [bookingId], (err) => {
                if (err) throw err;

                const restoreSeatsSql = 'UPDATE flights SET available_seats = available_seats + ? WHERE id = ?';
                db.query(restoreSeatsSql, [booking.passenger_count, booking.flight_id], (err) => {
                    if (err) throw err;
                    req.flash('success', 'Booking cancelled and seats released.');
                    res.redirect('/admin/bookings');
                });
            });
        });
    });
});

// ---------- Admin: Reactivate a booking the admin previously cancelled ----------
// admin-bookings.ejs posts here for the "Reactivate" button - this was referenced
// in the view but had no matching route. Only bookings cancelled by an admin (or
// with no cancelled_by recorded) can be reactivated here, matching the view's logic;
// bookings a customer cancelled themselves show "No action" instead.

app.post('/admin/bookings/reactivate/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookingId = req.params.id;

    const sql = `SELECT bookings.*, flights.available_seats
                 FROM bookings LEFT JOIN flights ON bookings.flight_id = flights.id
                 WHERE bookings.id = ?`;
    db.query(sql, [bookingId], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            req.flash('error', 'Booking not found.');
            return res.redirect('/admin/bookings');
        }

        const booking = results[0];
        if (booking.status !== 'cancelled') {
            req.flash('error', 'Only cancelled bookings can be reactivated.');
            return res.redirect('/admin/bookings');
        }
        if (booking.cancelled_by !== 'admin' && booking.cancelled_by !== null && booking.cancelled_by !== '') {
            req.flash('error', 'This booking was cancelled by the customer and cannot be reactivated here.');
            return res.redirect('/admin/bookings');
        }
        if (booking.available_seats === null) {
            req.flash('error', 'This booking cannot be reactivated because the flight was removed.');
            return res.redirect('/admin/bookings');
        }
        if (booking.passenger_count > booking.available_seats) {
            req.flash('error', `Only ${booking.available_seats} seat(s) left on this flight - not enough to reactivate.`);
            return res.redirect('/admin/bookings');
        }

        const seatNumbers = (booking.seat_numbers || '').split(',').map(s => s.trim()).filter(Boolean);

        // Make sure the booking's original seats haven't been claimed by someone else
        // since it was cancelled.
        const seatCheckSql = 'SELECT seat_number FROM seats WHERE flight_id = ? AND seat_number IN (?) AND booking_id IS NOT NULL';
        db.query(seatCheckSql, [booking.flight_id, seatNumbers], (err, takenRows) => {
            if (err) throw err;
            if (seatNumbers.length > 0 && takenRows.length > 0) {
                req.flash('error', `Seat(s) ${takenRows.map(r => r.seat_number).join(', ')} have since been taken by another booking. Cannot reactivate.`);
                return res.redirect('/admin/bookings');
            }

            db.query('UPDATE bookings SET status = ?, cancelled_by = NULL WHERE id = ?', ['confirmed', bookingId], (err) => {
                if (err) throw err;

                const claimSeats = (cb) => {
                    if (seatNumbers.length === 0) return cb(null);
                    const claimSeatsSql = 'UPDATE seats SET booking_id = ? WHERE flight_id = ? AND seat_number IN (?)';
                    db.query(claimSeatsSql, [bookingId, booking.flight_id, seatNumbers], cb);
                };

                claimSeats((err) => {
                    if (err) throw err;

                    const updateSeatsSql = 'UPDATE flights SET available_seats = available_seats - ? WHERE id = ?';
                    db.query(updateSeatsSql, [booking.passenger_count, booking.flight_id], (err) => {
                        if (err) throw err;
                        req.flash('success', 'Booking reactivated successfully!');
                        res.redirect('/admin/bookings');
                    });
                });
            });
        });
    });
});




// Starting the server
app.listen(3000, () => {
    console.log('SkyWings server started on http://localhost:3000');
});