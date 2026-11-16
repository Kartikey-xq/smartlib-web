-- SMARTLIB Library Management System - PostgreSQL Schema Migration
-- Converted from MySQL schema with robust constraints and FIFO reservation tracking

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
);

CREATE TABLE IF NOT EXISTS students (
    student_id INT PRIMARY KEY,
    student_name VARCHAR(150) NOT NULL,
    course VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_records (
    issue_id SERIAL PRIMARY KEY,
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
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Index for searching issue status
CREATE INDEX IF NOT EXISTS idx_issue_book_student_status 
    ON issue_records (book_id, student_id, returned);

-- Enforce at DB level: a student cannot hold duplicate active issues for the same book
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_issue 
    ON issue_records (book_id, student_id) 
    WHERE (returned = FALSE);

CREATE TABLE IF NOT EXISTS reservations (
    reservation_id SERIAL PRIMARY KEY,
    book_id INT NOT NULL,
    student_id INT NOT NULL,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING' 
        CHECK (status IN ('WAITING', 'FULFILLED', 'CANCELLED')),
    CONSTRAINT fk_reservation_book
        FOREIGN KEY (book_id) REFERENCES books(book_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservation_student
        FOREIGN KEY (student_id) REFERENCES students(student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Index for FIFO queue lookup
CREATE INDEX IF NOT EXISTS idx_reservation_queue 
    ON reservations (book_id, status, reservation_id);

-- Enforce at DB level: a student cannot place duplicate waiting reservations for the same book
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_reservation 
    ON reservations (book_id, student_id) 
    WHERE (status = 'WAITING');
