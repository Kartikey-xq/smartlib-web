// SMARTLIB Frontend API Client

async function request(url, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.details || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Books
  getBooks: (q = '') => request(`/api/books${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addBook: (book) => request('/api/books', { method: 'POST', body: book }),
  updateBook: (book) => request('/api/books', { method: 'PUT', body: book }),
  deleteBook: (book_id) => request(`/api/books?book_id=${book_id}`, { method: 'DELETE' }),

  // Students
  getStudents: (q = '') => request(`/api/students${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  addStudent: (student) => request('/api/students', { method: 'POST', body: student }),
  deleteStudent: (student_id) => request(`/api/students?student_id=${student_id}`, { method: 'DELETE' }),

  // Issues & Returns
  getIssues: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/api/issues${query ? `?${query}` : ''}`);
  },
  issueBook: (data) => request('/api/issues', { method: 'POST', body: data }),
  returnBook: (data) => request('/api/return', { method: 'POST', body: data }),

  // Reservations
  getReservations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/api/reservations${query ? `?${query}` : ''}`);
  },
  reserveBook: (data) => request('/api/reservations', { method: 'POST', body: data }),
  fulfillReservation: (data) => request('/api/reservations', { method: 'PUT', body: data }),
  cancelReservation: (reservation_id) => request(`/api/reservations?reservation_id=${reservation_id}`, { method: 'DELETE' }),

  // Stats
  getStats: () => request('/api/stats'),
};
