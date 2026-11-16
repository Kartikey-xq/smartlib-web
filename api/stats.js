import { query } from './db.js';
import { sendJson, sendError } from './utils.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, `Method ${req.method} not allowed.`);
  }

  try {
    const [booksRes, studentsRes, issuesRes, overdueRes, reservationsRes] = await Promise.all([
      query(`SELECT 
              COUNT(*) AS total_titles, 
              COALESCE(SUM(total_quantity), 0) AS total_copies, 
              COALESCE(SUM(available_quantity), 0) AS available_copies 
             FROM books`),
      query(`SELECT COUNT(*) AS total_students FROM students`),
      query(`SELECT COUNT(*) AS active_issues FROM issue_records WHERE returned = FALSE`),
      query(`SELECT COUNT(*) AS overdue_issues FROM issue_records WHERE returned = FALSE AND due_date < CURRENT_DATE`),
      query(`SELECT COUNT(*) AS waiting_reservations FROM reservations WHERE status = 'WAITING'`),
    ]);

    const totalTitles = parseInt(booksRes.rows[0].total_titles, 10);
    const totalCopies = parseInt(booksRes.rows[0].total_copies, 10);
    const availableCopies = parseInt(booksRes.rows[0].available_copies, 10);
    const issuedCopies = totalCopies - availableCopies;
    const totalStudents = parseInt(studentsRes.rows[0].total_students, 10);
    const activeIssues = parseInt(issuesRes.rows[0].active_issues, 10);
    const overdueIssues = parseInt(overdueRes.rows[0].overdue_issues, 10);
    const waitingReservations = parseInt(reservationsRes.rows[0].waiting_reservations, 10);

    return sendJson(res, 200, {
      stats: {
        totalTitles,
        totalCopies,
        availableCopies,
        issuedCopies,
        totalStudents,
        activeIssues,
        overdueIssues,
        waitingReservations,
      },
    });
  } catch (err) {
    console.error('Stats API error:', err);
    return sendError(res, 500, 'Database error while fetching library stats.', err);
  }
}
