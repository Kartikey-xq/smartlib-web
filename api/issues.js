import { query, getClient } from './db.js';
import { sendJson, sendError, parseBody, parseQuery } from './utils.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      const { status, student_id, book_id } = parseQuery(req);
      let sql = `
        SELECT 
          ir.issue_id,
          ir.book_id,
          b.title AS book_title,
          b.author AS book_author,
          ir.student_id,
          s.student_name,
          s.course AS student_course,
          TO_CHAR(ir.issue_date, 'YYYY-MM-DD') AS issue_date,
          TO_CHAR(ir.due_date, 'YYYY-MM-DD') AS due_date,
          ir.returned,
          CASE 
            WHEN ir.returned = TRUE THEN 'RETURNED'
            WHEN ir.due_date < CURRENT_DATE THEN 'OVERDUE'
            ELSE 'ACTIVE'
          END AS status_label
        FROM issue_records ir
        JOIN books b ON ir.book_id = b.book_id
        JOIN students s ON ir.student_id = s.student_id
        WHERE 1=1
      `;
      const params = [];

      if (status === 'active') {
        sql += ` AND ir.returned = FALSE`;
      } else if (status === 'returned') {
        sql += ` AND ir.returned = TRUE`;
      } else if (status === 'overdue') {
        sql += ` AND ir.returned = FALSE AND ir.due_date < CURRENT_DATE`;
      }

      if (student_id) {
        params.push(parseInt(student_id, 10));
        sql += ` AND ir.student_id = $${params.length}`;
      }

      if (book_id) {
        params.push(parseInt(book_id, 10));
        sql += ` AND ir.book_id = $${params.length}`;
      }

      sql += ` ORDER BY ir.issue_id DESC`;

      const result = await query(sql, params);
      return sendJson(res, 200, { issues: result.rows });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const student_id = parseInt(body.student_id, 10);
      const book_id = parseInt(body.book_id, 10);
      let issue_date = (body.issue_date || '').trim();
      let due_date = (body.due_date || '').trim();

      if (isNaN(student_id)) return sendError(res, 400, 'Valid Student ID is required.');
      if (isNaN(book_id)) return sendError(res, 400, 'Valid Book ID is required.');

      // Default issue_date to today, due_date to 14 days later if omitted
      const today = new Date().toISOString().split('T')[0];
      if (!issue_date) issue_date = today;
      if (!due_date) {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        due_date = d.toISOString().split('T')[0];
      }

      if (due_date < issue_date) {
        return sendError(res, 400, 'Due date cannot be earlier than issue date.');
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Check student
        const studentRes = await client.query('SELECT * FROM students WHERE student_id = $1', [student_id]);
        if (studentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return sendError(res, 404, `Student ID ${student_id} not found. Register the student first.`);
        }
        const student = studentRes.rows[0];

        // Check duplicate active issue
        const activeIssueRes = await client.query(
          'SELECT issue_id FROM issue_records WHERE student_id = $1 AND book_id = $2 AND returned = FALSE',
          [student_id, book_id]
        );
        if (activeIssueRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            400,
            `Student '${student.student_name}' already has an active issue of this book (Issue ID ${activeIssueRes.rows[0].issue_id}). Return it before issuing another copy.`
          );
        }

        // Lock book row
        const bookRes = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [book_id]);
        if (bookRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return sendError(res, 404, `Book ID ${book_id} not found.`);
        }
        const book = bookRes.rows[0];

        // Check inventory
        if (book.available_quantity <= 0) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            400,
            `No copies of '${book.title}' are currently available (0/${book.total_quantity} in stock). You can place a reservation instead.`
          );
        }

        // Decrement available quantity
        await client.query(
          'UPDATE books SET available_quantity = available_quantity - 1 WHERE book_id = $1',
          [book_id]
        );

        // Insert issue record
        const issueInsert = await client.query(
          `INSERT INTO issue_records (book_id, student_id, issue_date, due_date, returned)
           VALUES ($1, $2, $3, $4, FALSE)
           RETURNING *`,
          [book_id, student_id, issue_date, due_date]
        );

        // If student had a waiting reservation for this book, fulfill it!
        await client.query(
          `UPDATE reservations 
           SET status = 'FULFILLED' 
           WHERE book_id = $1 AND student_id = $2 AND status = 'WAITING'`,
          [book_id, student_id]
        );

        await client.query('COMMIT');

        return sendJson(res, 201, {
          issue: issueInsert.rows[0],
          book_title: book.title,
          student_name: student.student_name,
          message: `Book '${book.title}' successfully issued to ${student.student_name}.`,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return sendError(res, 405, `Method ${req.method} not allowed.`);
  } catch (err) {
    console.error('Issues API error:', err);
    return sendError(res, 500, 'Database error while processing issue request.', err);
  }
}
