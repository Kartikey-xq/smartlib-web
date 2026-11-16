-- SMARTLIB - Phase 3 MySQL Database
-- Run this script in MySQL Workbench after connecting to MySQL Server.

CREATE DATABASE IF NOT EXISTS smartlib_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smartlib_db;

CREATE TABLE IF NOT EXISTS books (
    book_id INT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    total_quantity INT NOT NULL,
    available_quantity INT NOT NULL,
    CONSTRAINT chk_book_total CHECK (total_quantity > 0),
    CONSTRAINT chk_book_available CHECK (
        available_quantity >= 0 AND available_quantity <= total_quantity
    )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
    student_id INT PRIMARY KEY,
    student_name VARCHAR(150) NOT NULL,
    course VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS issue_records (
    issue_id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    student_id INT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    returned BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_issue_book
        FOREIGN KEY (book_id) REFERENCES books(book_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_issue_student
        FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_issue_book_student_status (book_id, student_id, returned)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    student_id INT NOT NULL,
    reserved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('WAITING', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    CONSTRAINT fk_reservation_book
        FOREIGN KEY (book_id) REFERENCES books(book_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservation_student
        FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_reservation_queue (book_id, status, reservation_id)
) ENGINE=InnoDB;

-- Verify that the database and tables were created.
SHOW TABLES;
