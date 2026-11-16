// SMARTLIB Mandatory Automated Verification Test Suite
// Executes steps 1-10 + edge-case validations and database persistence checks

import http from 'http';
import { pool, query } from '../api/db.js';

// We can test against the API handlers directly
import booksHandler from '../api/books.js';
import studentsHandler from '../api/students.js';
import issuesHandler from '../api/issues.js';
import returnHandler from '../api/return.js';
import reservationsHandler from '../api/reservations.js';
import statsHandler from '../api/stats.js';

function mockReqRes(method, url, body = null) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      headers: { 'content-type': 'application/json' },
      body,
      on(event, handler) {
        if (event === 'data' && body) {
          handler(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
        }
        if (event === 'end') {
          handler();
        }
        return this;
      },
    };

    let statusCode = 200;
    const headers = {};
    let responseBody = '';

    const res = {
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      set statusCode(val) {
        statusCode = val;
      },
      get statusCode() {
        return statusCode;
      },
      end(chunk) {
        if (chunk) responseBody += chunk;
        let parsed = responseBody;
        try {
          parsed = JSON.parse(responseBody);
        } catch {}
        resolve({
          status: statusCode,
          headers,
          data: parsed,
          raw: responseBody,
        });
      },
    };

    const pathname = url.split('?')[0];
    if (pathname === '/api/books') booksHandler(req, res);
    else if (pathname === '/api/students') studentsHandler(req, res);
    else if (pathname === '/api/issues') issuesHandler(req, res);
    else if (pathname === '/api/return') returnHandler(req, res);
    else if (pathname === '/api/reservations') reservationsHandler(req, res);
    else if (pathname === '/api/stats') statsHandler(req, res);
    else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   SMARTLIB MANDATORY VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  const TEST_BOOK_ID = 9001;
  const STUDENT_A = 8001;
  const STUDENT_B = 8002;

  try {
    // PRE-CLEANUP
    console.log('[Setup] Cleaning up any prior test records...');
    await query('DELETE FROM reservations WHERE book_id = $1 OR student_id IN ($2, $3)', [TEST_BOOK_ID, STUDENT_A, STUDENT_B]);
    await query('DELETE FROM issue_records WHERE book_id = $1 OR student_id IN ($2, $3)', [TEST_BOOK_ID, STUDENT_A, STUDENT_B]);
    await query('DELETE FROM books WHERE book_id = $1', [TEST_BOOK_ID]);
    await query('DELETE FROM students WHERE student_id IN ($1, $2)', [STUDENT_A, STUDENT_B]);
    console.log('  ✓ Clean setup verified.\n');

    // STEP 1: Add a book with quantity 1
    console.log('[Step 1] Add a book with quantity 1');
    const addBookRes = await mockReqRes('POST', '/api/books', {
      book_id: TEST_BOOK_ID,
      title: 'Automated Software Testing & Systems',
      author: 'E. Dijkstra & A. Turing',
      category: 'Computer Science',
      total_quantity: 1,
    });
    assert(addBookRes.status === 201, `Book created with 201 Created (Got ${addBookRes.status})`);
    assert(addBookRes.data.book.available_quantity === 1, 'Book available_quantity is 1');
    assert(addBookRes.data.book.total_quantity === 1, 'Book total_quantity is 1');

    // STEP 2: Register two students
    console.log('\n[Step 2] Register two students');
    const addStudentARes = await mockReqRes('POST', '/api/students', {
      student_id: STUDENT_A,
      student_name: 'Student Alpha',
      course: 'B.Tech CS',
    });
    assert(addStudentARes.status === 201, 'Student Alpha registered');

    const addStudentBRes = await mockReqRes('POST', '/api/students', {
      student_id: STUDENT_B,
      student_name: 'Student Beta',
      course: 'B.Tech IT',
    });
    assert(addStudentBRes.status === 201, 'Student Beta registered');

    // Duplicate student prevention check
    const dupStudentRes = await mockReqRes('POST', '/api/students', {
      student_id: STUDENT_A,
      student_name: 'Duplicate Student Alpha',
      course: 'B.Tech CS',
    });
    assert(dupStudentRes.status === 409, 'Duplicate student registration rejected with 409 Conflict');

    // STEP 3: Issue the book to student A
    console.log('\n[Step 3] Issue the book to student A');
    const issueRes = await mockReqRes('POST', '/api/issues', {
      book_id: TEST_BOOK_ID,
      student_id: STUDENT_A,
      issue_date: '2026-11-16',
      due_date: '2026-11-30',
    });
    assert(issueRes.status === 201, 'Book issued to student A');
    const issueIdA = issueRes.data.issue.issue_id;

    // STEP 4: Verify inventory becomes 0
    console.log('\n[Step 4] Verify inventory becomes 0');
    const getBooksRes = await mockReqRes('GET', `/api/books?q=${TEST_BOOK_ID}`);
    const foundBook = getBooksRes.data.books.find((b) => b.book_id === TEST_BOOK_ID);
    assert(foundBook !== undefined, 'Book found in inventory list');
    assert(foundBook.available_quantity === 0, 'Available quantity is 0');
    assert(foundBook.issued_quantity === 1, 'Issued quantity is 1');

    // Negative inventory prevention: Attempting to issue when stock is 0 must fail!
    console.log('\n[Edge Case Validation] Prevent negative inventory & duplicate active issues');
    const overIssueRes = await mockReqRes('POST', '/api/issues', {
      book_id: TEST_BOOK_ID,
      student_id: STUDENT_B,
    });
    assert(overIssueRes.status === 400, 'Over-issuing rejected with 400 (Negative inventory prevented)');

    // Duplicate active issue: Student A cannot borrow the same book twice
    const dupIssueRes = await mockReqRes('POST', '/api/issues', {
      book_id: TEST_BOOK_ID,
      student_id: STUDENT_A,
    });
    assert(dupIssueRes.status === 400, 'Duplicate active issue rejected with 400');

    // STEP 5: Reserve the book for student B
    console.log('\n[Step 5] Reserve the book for student B');
    const reserveRes = await mockReqRes('POST', '/api/reservations', {
      book_id: TEST_BOOK_ID,
      student_id: STUDENT_B,
    });
    assert(reserveRes.status === 201, 'Reservation placed for student B');
    assert(reserveRes.data.queue_position === 1, 'Student B is #1 in FIFO queue');
    const reservationIdB = reserveRes.data.reservation.reservation_id;

    // Duplicate reservation prevention
    const dupReserveRes = await mockReqRes('POST', '/api/reservations', {
      book_id: TEST_BOOK_ID,
      student_id: STUDENT_B,
    });
    assert(dupReserveRes.status === 400, 'Duplicate active reservation rejected with 400');

    // STEP 6: Return the book from student A
    console.log('\n[Step 6] Return the book from student A');
    const returnRes = await mockReqRes('POST', '/api/return', {
      issue_id: issueIdA,
    });
    assert(returnRes.status === 200, 'Book returned successfully');
    assert(returnRes.data.available_quantity === 1, 'Available quantity incremented to 1');
    assert(returnRes.data.next_in_queue !== null, 'FIFO queue priority notification returned');
    assert(returnRes.data.next_in_queue.student_id === STUDENT_B, 'Next in queue identified as Student Beta');

    // STEP 7: Process the reservation for student B
    console.log('\n[Step 7] Process the reservation for student B');
    const fulfillRes = await mockReqRes('PUT', '/api/reservations', {
      reservation_id: reservationIdB,
      issue_date: '2026-11-16',
      due_date: '2026-11-30',
    });
    assert(fulfillRes.status === 200, 'Reservation fulfilled and book issued to student B');

    // STEP 8: Verify inventory and reservation state remain consistent
    console.log('\n[Step 8] Verify inventory and reservation state remain consistent');
    const bookAfterFulfill = await mockReqRes('GET', `/api/books?q=${TEST_BOOK_ID}`);
    const bState = bookAfterFulfill.data.books.find((b) => b.book_id === TEST_BOOK_ID);
    assert(bState.available_quantity === 0, 'Available quantity is 0 (issued to student B)');

    const reservationsRes = await mockReqRes('GET', `/api/reservations?book_id=${TEST_BOOK_ID}`);
    const resState = reservationsRes.data.reservations.find((r) => r.reservation_id === reservationIdB);
    assert(resState.status === 'FULFILLED', 'Reservation status is FULFILLED in queue');

    // STEP 9 & 10: Refresh the browser / Direct DB persistence verification
    console.log('\n[Step 9 & 10] Direct database persistence verification');
    const dbBook = await query('SELECT * FROM books WHERE book_id = $1', [TEST_BOOK_ID]);
    assert(dbBook.rows[0].available_quantity === 0, 'Direct DB query: available_quantity = 0');
    assert(dbBook.rows[0].total_quantity === 1, 'Direct DB query: total_quantity = 1');

    const dbIssues = await query('SELECT * FROM issue_records WHERE book_id = $1 ORDER BY issue_id ASC', [TEST_BOOK_ID]);
    assert(dbIssues.rows.length === 2, 'Direct DB query: 2 issue records found (1 returned, 1 active)');
    assert(dbIssues.rows[0].returned === true, 'Direct DB query: Student A record returned = TRUE');
    assert(dbIssues.rows[1].returned === false, 'Direct DB query: Student B record returned = FALSE');

    const dbRes = await query('SELECT * FROM reservations WHERE reservation_id = $1', [reservationIdB]);
    assert(dbRes.rows[0].status === 'FULFILLED', 'Direct DB query: Reservation status = FULFILLED');

    // STATS ENDPOINT CHECK
    console.log('\n[Step 11] Global Library Stats check');
    const statsRes = await mockReqRes('GET', '/api/stats');
    assert(statsRes.status === 200, 'Stats endpoint returned 200');
    assert(typeof statsRes.data.stats.totalTitles === 'number', 'Total titles is a valid metric');
    assert(typeof statsRes.data.stats.activeIssues === 'number', 'Active issues is a valid metric');

    // CLEANUP TEST DATA
    console.log('\n[Step 12] Clean up test data');
    await query('DELETE FROM reservations WHERE book_id = $1', [TEST_BOOK_ID]);
    await query('DELETE FROM issue_records WHERE book_id = $1', [TEST_BOOK_ID]);
    await query('DELETE FROM books WHERE book_id = $1', [TEST_BOOK_ID]);
    await query('DELETE FROM students WHERE student_id IN ($1, $2)', [STUDENT_A, STUDENT_B]);
    console.log('  ✓ Test data cleaned up successfully.');

    console.log('\n======================================================');
    console.log('   ✅ ALL 12 MANDATORY TEST PHASES PASSED 100%!');
    console.log('======================================================\n');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runTestSuite();
