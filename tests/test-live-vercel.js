// Live End-to-End Test Suite against Production Vercel URL

const BASE_URL = 'https://lib-black.vercel.app';

async function req(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('   VERIFYING LIVE PRODUCTION DEPLOYMENT AT:');
  console.log(`   ${BASE_URL}`);
  console.log('======================================================\n');

  const BOOK_ID = 9999;
  const STU_A = 8881;
  const STU_B = 8882;

  // Cleanup before
  await req(`/api/books?book_id=${BOOK_ID}`, 'DELETE').catch(() => {});
  await req(`/api/students?student_id=${STU_A}`, 'DELETE').catch(() => {});
  await req(`/api/students?student_id=${STU_B}`, 'DELETE').catch(() => {});

  // 1. Add book
  console.log('[Live 1] Add book with quantity 1');
  const bRes = await req('/api/books', 'POST', {
    book_id: BOOK_ID,
    title: 'Cloud Distributed Systems',
    author: 'Lamport & Gray',
    category: 'Distributed Systems',
    total_quantity: 1,
  });
  assert(bRes.status === 201, `Book added on live Vercel (HTTP ${bRes.status})`);

  // 2. Register students
  console.log('[Live 2] Register two students');
  const sARes = await req('/api/students', 'POST', {
    student_id: STU_A,
    student_name: 'Live Student A',
    course: 'Cloud Computing',
  });
  assert(sARes.status === 201, 'Student A registered on live Vercel');

  const sBRes = await req('/api/students', 'POST', {
    student_id: STU_B,
    student_name: 'Live Student B',
    course: 'Cybersecurity',
  });
  assert(sBRes.status === 201, 'Student B registered on live Vercel');

  // 3. Issue to student A
  console.log('[Live 3] Issue book to Student A');
  const issueRes = await req('/api/issues', 'POST', {
    book_id: BOOK_ID,
    student_id: STU_A,
    issue_date: '2026-11-16',
    due_date: '2026-11-30',
  });
  assert(issueRes.status === 201, 'Book issued to Student A on live Vercel');
  const issueId = issueRes.data.issue.issue_id;

  // 4. Verify stock is 0
  console.log('[Live 4] Verify inventory is 0');
  const checkStock = await req(`/api/books?q=${BOOK_ID}`);
  const book = checkStock.data.books.find((b) => b.book_id === BOOK_ID);
  assert(book && book.available_quantity === 0, 'Available stock is 0 on live Vercel');

  // 5. Reserve for student B
  console.log('[Live 5] Place FIFO reservation for Student B');
  const rRes = await req('/api/reservations', 'POST', {
    book_id: BOOK_ID,
    student_id: STU_B,
  });
  assert(rRes.status === 201, 'Reservation placed for Student B');
  const resId = rRes.data.reservation.reservation_id;

  // 6. Return book from student A
  console.log('[Live 6] Return book from Student A');
  const retRes = await req('/api/return', 'POST', {
    issue_id: issueId,
  });
  assert(retRes.status === 200, 'Book returned on live Vercel');
  assert(retRes.data.available_quantity === 1, 'Stock restored to 1');
  assert(retRes.data.next_in_queue !== null, 'FIFO queue alert returned for Student B');

  // 7. Fulfill reservation for student B
  console.log('[Live 7] Fulfill FIFO reservation for Student B');
  const fulRes = await req('/api/reservations', 'PUT', {
    reservation_id: resId,
    issue_date: '2026-11-16',
    due_date: '2026-11-30',
  });
  assert(fulRes.status === 200, 'Reservation fulfilled and book issued on live Vercel');

  // 8. Verify state consistency
  console.log('[Live 8] Verify final state consistency');
  const finalBook = await req(`/api/books?q=${BOOK_ID}`);
  const fb = finalBook.data.books.find((b) => b.book_id === BOOK_ID);
  assert(fb.available_quantity === 0, 'Stock is 0 after fulfillment');

  const finalRes = await req(`/api/reservations?book_id=${BOOK_ID}`);
  const fr = finalRes.data.reservations.find((r) => r.reservation_id === resId);
  assert(fr.status === 'FULFILLED', 'Reservation marked FULFILLED on live Vercel');

  // 9. Clean up test data
  console.log('[Live 9] Clean up live test records');
  await req('/api/return', 'POST', { student_id: STU_B, book_id: BOOK_ID });
  await req(`/api/books?book_id=${BOOK_ID}`, 'DELETE');
  await req(`/api/students?student_id=${STU_A}`, 'DELETE');
  await req(`/api/students?student_id=${STU_B}`, 'DELETE');
  console.log('  ✓ Live test data cleaned up successfully.');

  console.log('\n======================================================');
  console.log('   🎉 LIVE VERCEL PRODUCTION DEPLOYMENT VERIFIED 100%!');
  console.log('======================================================\n');
}

run();
