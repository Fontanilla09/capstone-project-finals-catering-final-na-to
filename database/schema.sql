-- CaterAI Database Schema
-- MySQL Database Setup

-- Create Database
CREATE DATABASE IF NOT EXISTS cateraiDB;
USE cateraiDB;

-- Users Table (Authentication only)
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'caterer', 'admin') DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Super Admin Seed Account
INSERT INTO users (email, password, role, created_at, updated_at) VALUES (
    'caterai@gmail.com',
    '$2y$10$OKy5o1iObpc6ns6diqX7IujHkgURViSS3aSleiYwDZqkcchdeVYlS',
    'admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Customers Table
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    profile_picture VARCHAR(255),
    address TEXT,
    city VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Caterers Table
CREATE TABLE caterers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    business_name VARCHAR(150) NOT NULL,
    business_permit VARCHAR(255) DEFAULT NULL,
    description TEXT,
    phone VARCHAR(15) NOT NULL,
    address TEXT,
    city VARCHAR(50),
    rating DECIMAL(3, 2) DEFAULT 0,
    paypal_email VARCHAR(150) DEFAULT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_submitted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Packages Table
CREATE TABLE packages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    caterer_id INT NOT NULL,
    package_name VARCHAR(150) NOT NULL,
    description TEXT,
    event_type VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    guest_count_min INT,
    guest_count_max INT,
    max_bookings INT NOT NULL DEFAULT 0,
    includes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE
);

-- Sample setup, food, and design photos for each package
CREATE TABLE package_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    package_id INT NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

-- Reservations Table
CREATE TABLE reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    caterer_id INT NOT NULL,
    package_id INT NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME,
    event_type VARCHAR(50),
    location TEXT NOT NULL,
    guest_count INT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    advance_payment DECIMAL(10, 2),
    balance_amount DECIMAL(10, 2),
    payment_status ENUM('pending', 'partial', 'completed') DEFAULT 'pending',
    reservation_status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
    special_requests TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

-- Payments Table
CREATE TABLE payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('e-wallet', 'cash', 'card', 'paypal') NOT NULL,
    payment_date DATE,
    reference_number VARCHAR(100),
    receipt_image VARCHAR(255),
    payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    provider VARCHAR(50) DEFAULT NULL,
    external_id VARCHAR(100) DEFAULT NULL,
    webhook_payload TEXT DEFAULT NULL,
    payment_type VARCHAR(30) DEFAULT 'down_payment',
    payer_email VARCHAR(150) DEFAULT NULL,
    payer_name VARCHAR(150) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- Manual payouts from the platform account to caterers
CREATE TABLE payouts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT NOT NULL UNIQUE,
    caterer_id INT NOT NULL,
    payment_id INT DEFAULT NULL,
    gross_amount DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    caterer_amount DECIMAL(10, 2) NOT NULL,
    payout_status ENUM('pending', 'processing', 'paid', 'failed') NOT NULL DEFAULT 'pending',
    payout_reference VARCHAR(100) DEFAULT NULL,
    payout_batch_id VARCHAR(100) DEFAULT NULL,
    payout_item_id VARCHAR(100) DEFAULT NULL,
    payout_error TEXT DEFAULT NULL,
    paid_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- Messages Table (Real-time Chat)
CREATE TABLE messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT DEFAULT NULL,
    package_id INT DEFAULT NULL,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    message TEXT NOT NULL,
    attachment VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Venue Visualization Table
CREATE TABLE venue_visualizations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT NOT NULL,
    original_image VARCHAR(255) NOT NULL,
    visualized_image VARCHAR(255),
    theme VARCHAR(100),
    decorations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- Reviews/Ratings Table
CREATE TABLE reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reservation_id INT NOT NULL,
    customer_id INT NOT NULL,
    caterer_id INT NOT NULL,
    rating INT CHECK(rating >= 1 AND rating <= 5),
    review_text TEXT,
    review_image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE
);

-- Recommendations Table (AI-based)
CREATE TABLE recommendations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    caterer_id INT NOT NULL,
    package_id INT NOT NULL,
    recommendation_score DECIMAL(3, 2),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (caterer_id) REFERENCES caterers(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

-- Create Indexes for Better Performance
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_caterer_user_id ON caterers(user_id);
CREATE INDEX idx_package_caterer_id ON packages(caterer_id);
CREATE INDEX idx_reservation_customer_id ON reservations(customer_id);
CREATE INDEX idx_reservation_caterer_id ON reservations(caterer_id);
CREATE INDEX idx_payment_reservation_id ON payments(reservation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_reviews_caterer_id ON reviews(caterer_id);
