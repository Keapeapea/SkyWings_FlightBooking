# SkyWings Flight Booking App — C237 CA2

## Setup

1. `npm install`
2. Create the database: import `database/schema.sql` into MySQL
   (`mysql -u root -p < database/schema.sql`, or run it in MySQL Workbench).
3. In `app.js`, update the `password` field in the `mysql.createConnection` block
   with your own MySQL root password.
4. `npm start` then visit `http://localhost:3000`

Seed accounts (password for both: `password123`):
- Admin: `admin@skywings.com`
- Customer: `john@example.com`

## How the app is organised (map this to your Team Development Journal)

| Area | Routes in app.js | Views |
|---|---|---|
| A — Registration, Login, Access Control | `/register`, `/login`, `/logout`, `checkAuthenticated`, `checkAdmin`, `checkCustomer` middleware | register.ejs, login.ejs |
| B — Adding Information | `POST /admin/flights/add`, `POST /book/:flightId` | admin-add-flight.ejs, book.ejs |
| C — Viewing Information | `GET /dashboard`, `GET /my-bookings`, `GET /admin`, `GET /admin/bookings` | dashboard.ejs, my-bookings.ejs, admin.ejs, admin-bookings.ejs |
| D — Editing Information | `POST /admin/flights/edit/:id`, `POST /bookings/edit/:id` | admin-edit-flight.ejs, edit-booking.ejs |
| E — Removing Information | `POST /admin/flights/delete/:id`, `POST /bookings/delete/:id` | (uses admin.ejs / my-bookings.ejs) |
| F — Search / Filter / Sort | Query-string logic inside `GET /dashboard` and `GET /admin` (destination, date, sort) | dashboard.ejs, admin.ejs |

## The enhancement: seat inventory management

This is the "meaningful enhancement" for your presentation. It's not one file — it's logic
threaded through booking creation, editing, and cancellation:

- **On booking (`POST /book/:flightId`)**: before inserting the booking, the app checks
  `passengerCount > flight.available_seats` and blocks the booking if there isn't enough
  room. If it passes, `available_seats` is decremented by the passenger count.
- **On editing a booking (`POST /bookings/edit/:id`)**: the app calculates the seat
  *delta* between the old and new passenger count, checks the flight has enough spare
  seats to cover an increase, then applies the delta to `available_seats`.
- **On cancelling (`POST /bookings/delete/:id`)**: the booking's passenger count is added
  back to `available_seats`, releasing the seats for other customers.

Whoever presents this should be ready to explain: why we store `available_seats` as a
separate column instead of calculating it live from bookings each time (trade-off: faster
reads, but needs careful updating to stay in sync — which is exactly what the three routes
above do).

## Notes

- Passwords are hashed with `SHA1()` in MySQL, matching the pattern used in the course's
  RegistrationApp template. This is for teaching purposes only, not production-grade.
- `dateStrings: true` is set on the MySQL connection so date columns come back as plain
  `'YYYY-MM-DD'` strings instead of JS Date objects — this avoids timezone-shift bugs when
  displaying or editing dates.
- Public registration always creates a `customer` account. The admin account is seeded
  directly via `schema.sql` — there's no self-service way to become an admin, which is a
  reasonable access-control decision you can point to in your presentation.
