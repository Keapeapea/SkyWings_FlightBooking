-- SkyWings Flight Booking Application
-- Database schema

CREATE DATABASE IF NOT EXISTS skywings_db;
USE skywings_db;

DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    contact VARCHAR(20) NOT NULL,
    role ENUM('admin', 'customer') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE flights (
    id INT AUTO_INCREMENT PRIMARY KEY,
    flight_number VARCHAR(20) NOT NULL UNIQUE,
    airline VARCHAR(50) NOT NULL,
    origin VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    departure_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    arrival_time TIME NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total_seats INT NOT NULL,
    available_seats INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    flight_id INT NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    passenger_count INT NOT NULL DEFAULT 1,
    seat_class ENUM('economy', 'business', 'first') NOT NULL DEFAULT 'economy',
    total_price DECIMAL(10,2) NOT NULL,
    status ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flight_id) REFERENCES flights(id) ON DELETE CASCADE
);

-- Sample users (password for both is: password123 -> stored as SHA1)
INSERT INTO users (username, email, password, address, contact, role) VALUES
('admin1', 'admin@skywings.com', SHA1('password123'), '1 Airport Blvd, Singapore', '91234567', 'admin'),
('johntan', 'john@example.com', SHA1('password123'), '22 Tampines Ave, Singapore', '98765432', 'customer');

-- Sample flights
INSERT INTO flights (flight_number, airline, origin, destination, departure_date, departure_time, arrival_time, price, total_seats, available_seats) VALUES
('SQ118', 'SkyWings Airlines', 'Singapore', 'Tokyo', '2026-08-10', '08:30:00', '16:20:00', 480.00, 180, 180),
('SQ225', 'SkyWings Airlines', 'Singapore', 'London', '2026-08-12', '23:55:00', '06:10:00', 1250.00, 220, 220),
('SQ301', 'SkyWings Airlines', 'Singapore', 'Sydney', '2026-08-15', '10:15:00', '20:40:00', 650.00, 200, 200),
('SQ402', 'SkyWings Airlines', 'Singapore', 'Bangkok', '2026-08-09', '07:00:00', '08:25:00', 180.00, 150, 150),
('SQ508', 'SkyWings Airlines', 'Singapore', 'Seoul', '2026-08-20', '13:45:00', '21:30:00', 520.00, 190, 190);

SELECT USER(), CURRENT_USER();