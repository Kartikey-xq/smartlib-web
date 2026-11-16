import { api } from './api.js';

// Application State
const state = {
  currentView: 'dashboard',
  books: [],
  students: [],
  issues: [],
  reservations: [],
  stats: null,
  historyFilter: 'all',
  editingBookId: null,
};

// Toast notification helper
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Confirmation Dialog helper
let confirmCallback = null;
export function showConfirm(title, message, onConfirm) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');
  const btn = document.getElementById('btnConfirmAction');

  titleEl.textContent = title;
  msgEl.textContent = message;
  confirmCallback = onConfirm;

  modal.classList.add('open');

  btn.onclick = async () => {
    modal.classList.remove('open');
    if (confirmCallback) {
      await confirmCallback();
      confirmCallback = null;
    }
  };
}

// Modal management
export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// View switcher
export function switchView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.app-view').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  const activeView = document.getElementById(`view-${viewName}`);
  if (activeView) activeView.classList.add('active');

  const titles = {
    dashboard: ['System Dashboard', 'Library operations overview and key metrics.'],
    books: ['Book Inventory', 'Manage book records, total quantities, and stock allocation.'],
    students: ['Students Directory', 'Registered student library accounts and borrowing profiles.'],
    circulation: ['Circulation & Return Desk', 'Issue physical books and process book check-ins.'],
    reservations: ['FIFO Reservation Queue', 'First-In First-Out reservation queue for zero-inventory books.'],
    history: ['Issue & Return History', 'Audit trail of all historical and current library checkouts.'],
  };

  const [title, desc] = titles[viewName] || ['SMARTLIB', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageDescription').textContent = desc;

  // Auto-focus or refresh specific view data
  if (viewName === 'circulation') populateDropdowns();
}

// Render Dashboard View
function renderDashboard() {
  const stats = state.stats || {
    totalTitles: state.books.length,
    totalCopies: state.books.reduce((acc, b) => acc + b.total_quantity, 0),
    availableCopies: state.books.reduce((acc, b) => acc + b.available_quantity, 0),
    totalStudents: state.students.length,
    activeIssues: state.issues.filter((i) => !i.returned).length,
    overdueIssues: state.issues.filter((i) => !i.returned && i.status_label === 'OVERDUE').length,
    waitingReservations: state.reservations.filter((r) => r.status === 'WAITING').length,
  };

  document.getElementById('kpiBooks').innerHTML = `${stats.totalTitles} <span class="kpi-sub">(${stats.totalCopies} copies)</span>`;
  document.getElementById('kpiAvailableCopies').textContent = `${stats.availableCopies} available for checkout`;
  document.getElementById('kpiStudents').textContent = stats.totalStudents;
  document.getElementById('kpiActiveLoans').textContent = stats.activeIssues;
  document.getElementById('kpiOverdue').textContent = `${stats.overdueIssues} overdue loans`;
  document.getElementById('kpiReservations').textContent = stats.waitingReservations;

  document.getElementById('badgeBookCount').textContent = stats.totalTitles;
  document.getElementById('badgeQueueCount').textContent = stats.waitingReservations;

  // Render waiting reservations in dashboard panel
  const queuePanel = document.getElementById('dashQueueList');
  const waitingList = state.reservations.filter((r) => r.status === 'WAITING').slice(0, 5);

  if (waitingList.length === 0) {
    queuePanel.innerHTML = '<div class="empty-state"><p>No waiting reservations in queue.</p></div>';
  } else {
    queuePanel.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Queue #</th>
              <th>Book</th>
              <th>Student</th>
              <th>Stock</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${waitingList
              .map(
                (r) => `
              <tr>
                <td><span class="badge badge-queue-rank">#${r.queue_position || 1}</span></td>
                <td><strong>${escapeHtml(r.book_title)}</strong></td>
                <td>${escapeHtml(r.student_name)}</td>
                <td>
                  ${
                    r.available_quantity > 0
                      ? `<span class="badge badge-in-stock">${r.available_quantity} Available!</span>`
                      : `<span class="badge badge-out-of-stock">0 copies</span>`
                  }
                </td>
                <td style="text-align: right;">
                  ${
                    r.available_quantity > 0
                      ? `<button class="btn btn-sm btn-primary" onclick="window.app.openFulfillModal(${r.reservation_id}, '${escapeHtml(r.book_title)}', '${escapeHtml(r.student_name)}')">Fulfill</button>`
                      : `<span class="badge badge-id">Waiting Return</span>`
                  }
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Render active issues in dashboard panel
  const activeIssuesPanel = document.getElementById('dashActiveIssuesList');
  const activeList = state.issues.filter((i) => !i.returned).slice(0, 5);

  if (activeList.length === 0) {
    activeIssuesPanel.innerHTML = '<div class="empty-state"><p>No active issues. All books are accounted for.</p></div>';
  } else {
    activeIssuesPanel.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Student</th>
              <th>Due Date</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${activeList
              .map(
                (i) => `
              <tr>
                <td><strong>${escapeHtml(i.book_title)}</strong></td>
                <td>${escapeHtml(i.student_name)}</td>
                <td>
                  <span class="${i.status_label === 'OVERDUE' ? 'text-danger' : ''}">${escapeHtml(i.due_date)}</span>
                  ${i.status_label === 'OVERDUE' ? '<span class="badge badge-out-of-stock ml-1">OVERDUE</span>' : ''}
                </td>
                <td style="text-align: right;">
                  <button class="btn btn-sm btn-secondary" onclick="window.app.processReturn(${i.issue_id})">Return</button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

// Render Books Table
function renderBooksTable() {
  const tbody = document.getElementById('booksTableBody');
  const q = (document.getElementById('booksSearchInput')?.value || '').toLowerCase().trim();

  const filtered = state.books.filter((b) => {
    if (!q) return true;
    return (
      String(b.book_id).includes(q) ||
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          No books found matching "${escapeHtml(q)}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((b) => {
      const avail = b.available_quantity;
      const total = b.total_quantity;
      const pct = Math.max(0, Math.min(100, Math.round((avail / total) * 100)));
      const fillClass = avail === 0 ? 'empty' : avail <= 1 ? 'low' : '';

      return `
      <tr>
        <td><span class="badge badge-id">#${b.book_id}</span></td>
        <td>
          <strong>${escapeHtml(b.title)}</strong>
        </td>
        <td>${escapeHtml(b.author)}</td>
        <td><span class="badge badge-category">${escapeHtml(b.category)}</span></td>
        <td>
          <div class="inventory-bar-wrap">
            <div class="inventory-text">${avail} / ${total} in stock</div>
            <div class="inventory-bar">
              <div class="inventory-fill ${fillClass}" style="width: ${pct}%"></div>
            </div>
          </div>
        </td>
        <td>
          ${
            b.waiting_reservations > 0
              ? `<span class="badge badge-queue">${b.waiting_reservations} waiting</span>`
              : `<span class="badge badge-id">0 in queue</span>`
          }
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 0.35rem;">
            ${
              avail > 0
                ? `<button class="btn btn-sm btn-secondary" onclick="window.app.quickIssueBook(${b.book_id})">Issue</button>`
                : `<button class="btn btn-sm btn-secondary" onclick="window.app.quickReserveBook(${b.book_id})">Reserve</button>`
            }
            <button class="btn btn-sm btn-secondary" onclick="window.app.openEditBookModal(${b.book_id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="window.app.deleteBook(${b.book_id})">Delete</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

// Render Students Table
function renderStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  const q = (document.getElementById('studentsSearchInput')?.value || '').toLowerCase().trim();

  const filtered = state.students.filter((s) => {
    if (!q) return true;
    return (
      String(s.student_id).includes(q) ||
      s.student_name.toLowerCase().includes(q) ||
      s.course.toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (s) => `
    <tr>
      <td><span class="badge badge-id">#${s.student_id}</span></td>
      <td><strong>${escapeHtml(s.student_name)}</strong></td>
      <td>${escapeHtml(s.course)}</td>
      <td>
        ${
          s.active_loans > 0
            ? `<span class="badge badge-in-stock">${s.active_loans} active loans</span>`
            : `<span class="badge badge-id">0 loans</span>`
        }
      </td>
      <td>
        ${
          s.active_reservations > 0
            ? `<span class="badge badge-queue">${s.active_reservations} queued</span>`
            : `<span class="badge badge-id">0 queued</span>`
        }
      </td>
      <td style="text-align: right;">
        <button class="btn btn-sm btn-secondary" onclick="window.app.quickIssueToStudent(${s.student_id})">Issue Book</button>
        <button class="btn btn-sm btn-danger" onclick="window.app.deleteStudent(${s.student_id})">Delete</button>
      </td>
    </tr>
  `
    )
    .join('');
}

// Render Active Loans Desk Table
function renderCirculationDesk() {
  const tbody = document.getElementById('activeLoansTableBody');
  const activeList = state.issues.filter((i) => !i.returned);
  document.getElementById('activeLoansCountBadge').textContent = `${activeList.length} Active`;

  if (activeList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No active loans currently checked out.</td></tr>`;
    return;
  }

  tbody.innerHTML = activeList
    .map(
      (i) => `
    <tr>
      <td><strong>${escapeHtml(i.book_title)}</strong></td>
      <td>${escapeHtml(i.student_name)} (ID #${i.student_id})</td>
      <td>
        <span class="${i.status_label === 'OVERDUE' ? 'text-danger' : ''}">${escapeHtml(i.due_date)}</span>
        ${i.status_label === 'OVERDUE' ? '<span class="badge badge-out-of-stock ml-1">OVERDUE</span>' : ''}
      </td>
      <td style="text-align: right;">
        <button class="btn btn-sm btn-primary" onclick="window.app.processReturn(${i.issue_id})">Return Book</button>
      </td>
    </tr>
  `
    )
    .join('');
}

// Render FIFO Reservations Queue Table
function renderReservationsTable() {
  const tbody = document.getElementById('reservationsTableBody');

  if (state.reservations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No reservations found in queue.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.reservations
    .map((r) => {
      const isWaiting = r.status === 'WAITING';
      const isAvailable = r.available_quantity > 0;

      return `
      <tr>
        <td>
          ${isWaiting ? `<span class="badge badge-queue-rank">#${r.queue_position || 1}</span>` : `<span class="badge badge-id">-</span>`}
        </td>
        <td><strong>${escapeHtml(r.book_title)}</strong> <span class="badge badge-id">#${r.book_id}</span></td>
        <td>
          ${
            r.available_quantity > 0
              ? `<span class="badge badge-in-stock">${r.available_quantity} Available Now</span>`
              : `<span class="badge badge-out-of-stock">0 / ${r.total_quantity} copies</span>`
          }
        </td>
        <td>${escapeHtml(r.student_name)} (ID #${r.student_id})</td>
        <td><small>${escapeHtml(r.reserved_at)}</small></td>
        <td>
          <span class="badge ${isWaiting ? 'badge-queue' : r.status === 'FULFILLED' ? 'badge-in-stock' : 'badge-id'}">
            ${escapeHtml(r.status)}
          </span>
        </td>
        <td style="text-align: right;">
          ${
            isWaiting
              ? `
            <div style="display: inline-flex; gap: 0.35rem;">
              ${
                isAvailable
                  ? `<button class="btn btn-sm btn-primary" onclick="window.app.openFulfillModal(${r.reservation_id}, '${escapeHtml(r.book_title)}', '${escapeHtml(r.student_name)}')">Fulfill</button>`
                  : `<button class="btn btn-sm btn-secondary" disabled title="Wait until a copy is returned">Queued</button>`
              }
              <button class="btn btn-sm btn-danger" onclick="window.app.cancelReservation(${r.reservation_id})">Cancel</button>
            </div>
            `
              : `<span class="badge badge-id">Completed</span>`
          }
        </td>
      </tr>
    `;
    })
    .join('');
}

// Render Issue History Table
function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const q = (document.getElementById('historySearchInput')?.value || '').toLowerCase().trim();

  let filtered = state.issues.filter((i) => {
    if (state.historyFilter === 'active') return !i.returned;
    if (state.historyFilter === 'returned') return i.returned;
    if (state.historyFilter === 'overdue') return !i.returned && i.status_label === 'OVERDUE';
    return true;
  });

  if (q) {
    filtered = filtered.filter(
      (i) =>
        i.book_title.toLowerCase().includes(q) ||
        i.student_name.toLowerCase().includes(q) ||
        String(i.issue_id).includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transaction history matching criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (i) => `
    <tr>
      <td><span class="badge badge-id">#${i.issue_id}</span></td>
      <td><strong>${escapeHtml(i.book_title)}</strong></td>
      <td>${escapeHtml(i.student_name)} (ID #${i.student_id})</td>
      <td>${escapeHtml(i.issue_date)}</td>
      <td>${escapeHtml(i.due_date)}</td>
      <td>
        <span class="badge ${i.returned ? 'badge-in-stock' : i.status_label === 'OVERDUE' ? 'badge-out-of-stock' : 'badge-queue'}">
          ${escapeHtml(i.status_label)}
        </span>
      </td>
    </tr>
  `
    )
    .join('');
}

// Populate select options in Circulation & Reservation modals
function populateDropdowns() {
  const studentSelect = document.getElementById('issueStudentSelect');
  const bookSelect = document.getElementById('issueBookSelect');
  const reserveStudentSelect = document.getElementById('reserveStudentSelect');
  const reserveBookSelect = document.getElementById('reserveBookSelect');

  // Students
  const studentOpts = state.students
    .map((s) => `<option value="${s.student_id}">${escapeHtml(s.student_name)} (ID: ${s.student_id}) — ${escapeHtml(s.course)}</option>`)
    .join('');

  if (studentSelect) {
    const curVal = studentSelect.value;
    studentSelect.innerHTML = `<option value="">-- Choose Student --</option>` + studentOpts;
    if (curVal) studentSelect.value = curVal;
  }
  if (reserveStudentSelect) {
    const curVal = reserveStudentSelect.value;
    reserveStudentSelect.innerHTML = `<option value="">-- Choose Student --</option>` + studentOpts;
    if (curVal) reserveStudentSelect.value = curVal;
  }

  // Books
  if (bookSelect) {
    const curVal = bookSelect.value;
    bookSelect.innerHTML =
      `<option value="">-- Choose Book --</option>` +
      state.books
        .map(
          (b) =>
            `<option value="${b.book_id}">${escapeHtml(b.title)} (ID: ${b.book_id}) [Available: ${b.available_quantity}/${b.total_quantity}]</option>`
        )
        .join('');
    if (curVal) bookSelect.value = curVal;
  }

  // Unavailable books for reservation
  if (reserveBookSelect) {
    const curVal = reserveBookSelect.value;
    const unavailableBooks = state.books.filter((b) => b.available_quantity === 0);
    reserveBookSelect.innerHTML =
      `<option value="">-- Choose Unavailable Book --</option>` +
      unavailableBooks
        .map((b) => `<option value="${b.book_id}">${escapeHtml(b.title)} (ID: ${b.book_id}) [0/${b.total_quantity} copies]</option>`)
        .join('');
    if (curVal) reserveBookSelect.value = curVal;
  }
}

// Refresh all application data from backend API
export async function refreshAllData() {
  try {
    const [booksRes, studentsRes, issuesRes, reservationsRes, statsRes] = await Promise.all([
      api.getBooks(),
      api.getStudents(),
      api.getIssues(),
      api.getReservations(),
      api.getStats().catch(() => null),
    ]);

    state.books = booksRes.books || [];
    state.students = studentsRes.students || [];
    state.issues = issuesRes.issues || [];
    state.reservations = reservationsRes.reservations || [];
    if (statsRes) state.stats = statsRes.stats;

    renderDashboard();
    renderBooksTable();
    renderStudentsTable();
    renderCirculationDesk();
    renderReservationsTable();
    renderHistoryTable();
    populateDropdowns();

    document.getElementById('dbStatus').classList.remove('offline');
  } catch (err) {
    console.error('Failed to refresh library data:', err);
    showToast('Failed to connect to database: ' + err.message, 'error');
  }
}

// Actions exposed to global window.app
window.app = {
  switchView,
  refreshAllData,

  // Books
  openAddBookModal() {
    state.editingBookId = null;
    document.getElementById('bookModalTitle').textContent = 'Add New Book';
    document.getElementById('bookForm').reset();
    document.getElementById('bookIdInput').disabled = false;
    document.getElementById('bookIdHint').textContent = 'Unique numeric identifier for the title.';
    openModal('bookModal');
  },

  openEditBookModal(bookId) {
    const book = state.books.find((b) => b.book_id === bookId);
    if (!book) return;

    state.editingBookId = bookId;
    document.getElementById('bookModalTitle').textContent = `Edit Book #${bookId}`;
    document.getElementById('bookIdInput').value = book.book_id;
    document.getElementById('bookIdInput').disabled = true;
    document.getElementById('bookIdHint').textContent = 'Book ID cannot be altered once created.';
    document.getElementById('bookTitleInput').value = book.title;
    document.getElementById('bookAuthorInput').value = book.author;
    document.getElementById('bookCategoryInput').value = book.category;
    document.getElementById('bookTotalQtyInput').value = book.total_quantity;

    openModal('bookModal');
  },

  deleteBook(bookId) {
    const book = state.books.find((b) => b.book_id === bookId);
    const title = book ? book.title : `#${bookId}`;

    showConfirm(
      'Delete Book Record',
      `Are you sure you want to permanently delete '${title}'? This will remove all inventory records for this book.`,
      async () => {
        try {
          const res = await api.deleteBook(bookId);
          showToast(res.message || 'Book deleted successfully.', 'success');
          await refreshAllData();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  },

  // Students
  openRegisterStudentModal() {
    document.getElementById('studentForm').reset();
    openModal('studentModal');
  },

  deleteStudent(studentId) {
    const student = state.students.find((s) => s.student_id === studentId);
    const name = student ? student.student_name : `#${studentId}`;

    showConfirm(
      'Delete Student Account',
      `Are you sure you want to delete student '${name}' (ID #${studentId})?`,
      async () => {
        try {
          const res = await api.deleteStudent(studentId);
          showToast(res.message || 'Student removed successfully.', 'success');
          await refreshAllData();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  },

  // Circulation Shortcuts
  quickIssueBook(bookId) {
    switchView('circulation');
    const select = document.getElementById('issueBookSelect');
    if (select) select.value = bookId;
  },

  quickIssueToStudent(studentId) {
    switchView('circulation');
    const select = document.getElementById('issueStudentSelect');
    if (select) select.value = studentId;
  },

  quickReserveBook(bookId) {
    const select = document.getElementById('reserveBookSelect');
    if (select) select.value = bookId;
    openModal('reserveModal');
  },

  processReturn(issueId) {
    const issue = state.issues.find((i) => i.issue_id === issueId);
    const title = issue ? issue.book_title : `Record #${issueId}`;
    const student = issue ? issue.student_name : 'the student';

    showConfirm(
      'Process Book Return',
      `Confirm check-in of '${title}' from ${student}? Inventory will increment immediately.`,
      async () => {
        try {
          const res = await api.returnBook({ issue_id: issueId });
          showToast(res.message || 'Book returned successfully!', 'success');

          // If a student was waiting in FIFO queue, announce priority!
          if (res.next_in_queue) {
            const next = res.next_in_queue;
            showToast(
              `🎉 Reservation Priority: Student ${next.student_name} is #1 in queue for this book!`,
              'warning'
            );
          }

          await refreshAllData();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  },

  // Reservations
  openFulfillModal(reservationId, bookTitle, studentName) {
    document.getElementById('fulfillReservationId').value = reservationId;
    document.getElementById('fulfillSummaryText').innerHTML = `
      <strong>Fulfill Reservation for:</strong> ${escapeHtml(studentName)}<br />
      <strong>Book:</strong> ${escapeHtml(bookTitle)}<br />
      <em>A copy is currently available in inventory. Entering due date will complete checkout.</em>
    `;

    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    document.getElementById('fulfillIssueDate').value = today;
    document.getElementById('fulfillDueDate').value = dueDate.toISOString().split('T')[0];

    openModal('fulfillModal');
  },

  cancelReservation(reservationId) {
    showConfirm(
      'Cancel Reservation',
      `Cancel reservation #${reservationId}? The next student in the FIFO queue will move up.`,
      async () => {
        try {
          const res = await api.cancelReservation(reservationId);
          showToast(res.message || 'Reservation cancelled.', 'success');
          await refreshAllData();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  },
};

// Initialize DOM Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Topbar Buttons
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    showToast('Refreshing library data...', 'info');
    refreshAllData();
  });

  document.getElementById('btnOpenAddBook')?.addEventListener('click', () => window.app.openAddBookModal());
  document.getElementById('btnToolbarAddBook')?.addEventListener('click', () => window.app.openAddBookModal());
  document.getElementById('btnOpenRegisterStudent')?.addEventListener('click', () => window.app.openRegisterStudentModal());
  document.getElementById('btnOpenReserveModal')?.addEventListener('click', () => openModal('reserveModal'));
  document.getElementById('btnQuickIssue')?.addEventListener('click', () => switchView('circulation'));

  // Modal Closers
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Modal Backdrop Click
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });

  // Form: Save / Edit Book
  document.getElementById('bookForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!state.editingBookId;

    const data = {
      book_id: parseInt(document.getElementById('bookIdInput').value, 10),
      title: document.getElementById('bookTitleInput').value.trim(),
      author: document.getElementById('bookAuthorInput').value.trim(),
      category: document.getElementById('bookCategoryInput').value.trim(),
      total_quantity: parseInt(document.getElementById('bookTotalQtyInput').value, 10),
    };

    try {
      if (isEdit) {
        const res = await api.updateBook(data);
        showToast(res.message || 'Book updated successfully.', 'success');
      } else {
        const res = await api.addBook(data);
        showToast(res.message || 'Book created successfully.', 'success');
      }
      closeModal('bookModal');
      await refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Form: Register Student
  document.getElementById('studentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      student_id: parseInt(document.getElementById('studentIdInput').value, 10),
      student_name: document.getElementById('studentNameInput').value.trim(),
      course: document.getElementById('studentCourseInput').value.trim(),
    };

    try {
      const res = await api.addStudent(data);
      showToast(res.message || 'Student registered successfully.', 'success');
      closeModal('studentModal');
      await refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Form: Issue Book
  const issueDateInput = document.getElementById('issueDate');
  const dueDateInput = document.getElementById('dueDate');
  if (issueDateInput && dueDateInput) {
    const today = new Date().toISOString().split('T')[0];
    const due = new Date();
    due.setDate(due.getDate() + 14);
    issueDateInput.value = today;
    dueDateInput.value = due.toISOString().split('T')[0];
  }

  document.getElementById('issueBookForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const student_id = parseInt(document.getElementById('issueStudentSelect').value, 10);
    const book_id = parseInt(document.getElementById('issueBookSelect').value, 10);
    const issue_date = document.getElementById('issueDate').value;
    const due_date = document.getElementById('dueDate').value;

    try {
      const res = await api.issueBook({ student_id, book_id, issue_date, due_date });
      showToast(res.message || 'Book issued successfully!', 'success');
      document.getElementById('issueBookForm').reset();
      // Reset dates
      const today = new Date().toISOString().split('T')[0];
      const due = new Date();
      due.setDate(due.getDate() + 14);
      issueDateInput.value = today;
      dueDateInput.value = due.toISOString().split('T')[0];
      await refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Form: Reserve Book (FIFO)
  document.getElementById('reserveForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const student_id = parseInt(document.getElementById('reserveStudentSelect').value, 10);
    const book_id = parseInt(document.getElementById('reserveBookSelect').value, 10);

    try {
      const res = await api.reserveBook({ student_id, book_id });
      showToast(res.message || 'Reservation placed successfully.', 'success');
      closeModal('reserveModal');
      await refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Form: Fulfill Reservation
  document.getElementById('fulfillForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reservation_id = parseInt(document.getElementById('fulfillReservationId').value, 10);
    const issue_date = document.getElementById('fulfillIssueDate').value;
    const due_date = document.getElementById('fulfillDueDate').value;

    try {
      const res = await api.fulfillReservation({ reservation_id, issue_date, due_date });
      showToast(res.message || 'Reservation fulfilled and book issued!', 'success');
      closeModal('fulfillModal');
      await refreshAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Search filtering
  document.getElementById('booksSearchInput')?.addEventListener('input', renderBooksTable);
  document.getElementById('studentsSearchInput')?.addEventListener('input', renderStudentsTable);
  document.getElementById('historySearchInput')?.addEventListener('input', renderHistoryTable);

  // History Filter Pills
  document.querySelectorAll('.filter-pills .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.historyFilter = pill.dataset.filter;
      renderHistoryTable();
    });
  });

  // Initial load
  refreshAllData();
});
