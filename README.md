# SMARTLIB — Cloud-Native Library Management System

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://neon.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **SMARTLIB** is an enterprise-grade, cloud-deployed web application for university and institutional library operations. Built with modern web standards, reactive Vanilla JavaScript, PostgreSQL persistence, and serverless API execution on Vercel.

---

## 🏛️ Project Architecture & Migration Overview

SMARTLIB was originally architected as a C++ terminal application (`library_management_phase2-1.cpp`) coupled with a legacy MySQL schema. This web application transforms the core algorithmic principles (Linked Lists, Binary Search Trees, and FIFO Queues) into a modern cloud architecture:

```
┌──────────────────────────────────────────────────────────┐
│                   Vite + Vanilla JS UI                   │
│        (Admin Dashboard, Reactive Tables, Modals)        │
└──────────────────────────┬───────────────────────────────┘
                           │ JSON REST Requests
                           ▼
┌──────────────────────────────────────────────────────────┐
│              Vercel Serverless Edge API                  │
│       (/api/books, /api/students, /api/issues...)        │
└──────────────────────────┬───────────────────────────────┘
                           │ ACID Transactions + Row Locks
                           ▼
┌──────────────────────────────────────────────────────────┐
│            Persistent PostgreSQL Cloud DB                │
│    (chk_book_available, idx_unique_active_issue, FIFO)   │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Fixes & Engineering Innovations

### 1. Robust FIFO Reservation Queue
* **Legacy Bug:** The original C++ implementation checked reservations in `processReservations()` but did not finalize checkout, re-queuing records without state transitions.
* **Modern Fix:** Reservations follow a strict state machine (`WAITING` ➔ `FULFILLED` / `CANCELLED`). When an issued book is returned, the system immediately checks the FIFO queue and gives priority to queue position #1. Admins can fulfill the reservation directly with one click.

### 2. Elimination of Race Conditions & Negative Inventory
* Critical circulation operations (`issueBook`, `returnBook`, `fulfillReservation`) run within **PostgreSQL ACID transactions** with row-level locks (`SELECT ... FOR UPDATE`).
* Database constraints (`chk_book_available CHECK (available_quantity >= 0 AND available_quantity <= total_quantity)`) strictly guarantee that physical stock can never become negative.

### 3. Database-Level Prevention of Duplicate Loans & Reservations
* PostgreSQL partial unique indexes enforce operational integrity at the storage engine level:
  - `idx_unique_active_issue`: Prevents any student from simultaneously borrowing multiple active copies of the same title (`WHERE returned = FALSE`).
  - `idx_unique_active_reservation`: Prevents duplicate waiting reservations for the same student on the same title (`WHERE status = 'WAITING'`).

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ES2022+), HTML5, CSS3, Vite 8 |
| **Backend API** | Vercel Serverless Functions (Node.js runtime) |
| **Database** | Persistent PostgreSQL (Foreign Keys, Triggers, Strict Constraints) |
| **Deployment** | Vercel Edge Cloud |
| **Source Control**| GitHub |

---

## 📊 Database Schema

```sql
-- Books catalog and inventory
CREATE TABLE books (
    book_id INT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    total_quantity INT NOT NULL,
    available_quantity INT NOT NULL,
    CONSTRAINT chk_book_total CHECK (total_quantity > 0),
    CONSTRAINT chk_book_available CHECK (available_quantity >= 0 AND available_quantity <= total_quantity)
);

-- Registered student profiles
CREATE TABLE students (
    student_id INT PRIMARY KEY,
    student_name VARCHAR(150) NOT NULL,
    course VARCHAR(100) NOT NULL
);

-- Active loans and return audit log
CREATE TABLE issue_records (
    issue_id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES books(book_id),
    student_id INT NOT NULL REFERENCES students(student_id),
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    returned BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX idx_unique_active_issue ON issue_records (book_id, student_id) WHERE (returned = FALSE);

-- First-in, first-out reservation queue
CREATE TABLE reservations (
    reservation_id SERIAL PRIMARY KEY,
    book_id INT NOT NULL REFERENCES books(book_id),
    student_id INT NOT NULL REFERENCES students(student_id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'FULFILLED', 'CANCELLED'))
);
CREATE UNIQUE INDEX idx_unique_active_reservation ON reservations (book_id, student_id) WHERE (status = 'WAITING');
```

---

## 💻 Local Development Setup

### 1. Prerequisites
* Node.js v18+ and pnpm / npm installed

### 2. Installation
```bash
git clone https://github.com/Kartikey-xq/smartlib-web.git
cd smartlib-web
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` and provide your PostgreSQL connection string:
```bash
cp .env.example .env
```

### 4. Run Development Server
```bash
npm run dev
```
Visit `http://localhost:3000` to interact with the live application.

### 5. Run Automated Test Suite
```bash
npm test
```
Executes the comprehensive 12-phase end-to-end integration and database consistency verification suite.

---

## 🧪 Automated Testing Verification

The included automated test runner (`tests/test-flow.js`) validates:
1. Adding a single-copy title (`total_quantity = 1`)
2. Registering multiple students
3. Issuing the book to Student A
4. Verifying available inventory becomes 0
5. Asserting rejection of negative inventory and duplicate loans
6. Placing a FIFO reservation for Student B
7. Returning the book from Student A and verifying priority alerts
8. Fulfilling the reservation for Student B
9. Direct database queries verifying multi-table ACID state persistence
10. Automatic cleanup of test artifacts
