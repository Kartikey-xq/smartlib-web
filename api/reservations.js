import { query, getClient } from './db.js';
import { sendJson, sendError, parseBody, parseQuery } from './utils.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      const { status, book_id, student_id } = parseQuery(req);
      let sql = `
        SELECT 
          r.reservation_id,
          r.book_id,
          b.title AS book_title,
          b.available_quantity,
          b.total_quantity,
          r.student_id,
          s.student_name,
          s.course AS student_course,
          TO_CHAR(r.reserved_at, 'YYYY-MM-DD HH24:MI:SS') AS reserved_at,
          r.status,
          ROW_NUMBER() OVER (
            PARTITION BY r.book_id, r.status 
            ORDER BY r.reservation_id ASC
          ) AS queue_position
        FROM reservations r
        JOIN books b ON r.book_id = b.book_id
        JOIN students s ON r.student_id = s.student_id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        params.push(status.toUpperCase());
        sql += ` AND r.status = $${params.length}`;
      }
      if (book_id) {
        params.push(parseInt(book_id, 10));
        sql += ` AND r.book_id = $${params.length}`;
      }
      if (student_id) {
        params.push(parseInt(student_id, 10));
        sql += ` AND r.student_id = $${params.length}`;
      }

      sql += ` ORDER BY r.status DESC, r.reservation_id ASC`;

      const result = await query(sql, params);
      return sendJson(res, 200, { reservations: result.rows });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const student_id = parseInt(body.student_id, 10);
      const book_id = parseInt(body.book_id, 10);

      if (isNaN(student_id)) return sendError(res, 400, 'Valid Student ID is required.');
      if (isNaN(book_id)) return sendError(res, 400, 'Valid Book ID is required.');

      // Check student
      const studentRes = await query('SELECT student_name FROM students WHERE student_id = $1', [student_id]);
      if (studentRes.rows.length === 0) {
        return sendError(res, 404, `Student ID ${student_id} not found. Register the student first.`);
      }
      const studentName = studentRes.rows[0].student_name;

      // Check book
      const bookRes = await query('SELECT title, available_quantity, total_quantity FROM books WHERE book_id = $1', [
        book_id,
      ]);
      if (bookRes.rows.length === 0) {
        return sendError(res, 404, `Book ID ${book_id} not found.`);
      }
      const book = bookRes.rows[0];

      // Fix logic issue: cannot reserve if copies are currently available
      if (book.available_quantity > 0) {
        return sendError(
          res,
          400,
          `A copy of '${book.title}' is currently available in stock (${book.available_quantity}/${book.total_quantity} copies). You can issue it directly instead of placing a reservation.`
        );
      }

      // Fix logic issue: prevent duplicate active reservation for same book
      const duplicateRes = await query(
        "SELECT reservation_id FROM reservations WHERE student_id = $1 AND book_id = $2 AND status = 'WAITING'",
        [student_id, book_id]
      );
      if (duplicateRes.rows.length > 0) {
        return sendError(
          res,
          400,
          `Student '${studentName}' already has an active reservation for '${book.title}' (Reservation #${duplicateRes.rows[0].reservation_id}).`
        );
      }

      // Fix logic issue: prevent student from reserving a book they currently hold
      const activeIssueRes = await query(
        'SELECT issue_id FROM issue_records WHERE student_id = $1 AND book_id = $2 AND returned = FALSE',
        [student_id, book_id]
      );
      if (activeIssueRes.rows.length > 0) {
        return sendError(res, 400, `Student '${studentName}' currently has this book issued. Cannot place reservation.`);
      }

      const insertRes = await query(
        `INSERT INTO reservations (book_id, student_id, status)
         VALUES ($1, $2, 'WAITING')
         RETURNING *`,
        [book_id, student_id]
      );

      // Find queue position
      const queueCountRes = await query(
        "SELECT COUNT(*) FROM reservations WHERE book_id = $1 AND status = 'WAITING' AND reservation_id <= $2",
        [book_id, insertRes.rows[0].reservation_id]
      );
      const position = parseInt(queueCountRes.rows[0].count, 10);

      return sendJson(res, 201, {
        reservation: insertRes.rows[0],
        queue_position: position,
        message: `Reservation placed successfully for '${studentName}'. You are #${position} in the FIFO waiting queue for '${book.title}'.`,
      });
    }

    if (req.method === 'PUT') {
      // Fulfill reservation (process queue)
      const body = await parseBody(req);
      const reservation_id = parseInt(body.reservation_id, 10);
      let issue_date = (body.issue_date || '').trim();
      let due_date = (body.due_date || '').trim();

      if (isNaN(reservation_id)) return sendError(res, 400, 'Valid Reservation ID is required.');

      const today = new Date().toISOString().split('T')[0];
      if (!issue_date) issue_date = today;
      if (!due_date) {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        due_date = d.toISOString().split('T')[0];
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        const resRes = await client.query(
          `SELECT r.*, b.title AS book_title, s.student_name
           FROM reservations r
           JOIN books b ON r.book_id = b.book_id
           JOIN students s ON r.student_id = s.student_id
           WHERE r.reservation_id = $1
           FOR UPDATE OF r`,
          [reservation_id]
        );

        if (resRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return sendError(res, 404, 'Reservation not found.');
        }

        const reservation = resRes.rows[0];
        if (reservation.status !== 'WAITING') {
          await client.query('ROLLBACK');
          return sendError(res, 400, `Reservation is already marked as ${reservation.status}.`);
        }

        // Lock book
        const bookRes = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [
          reservation.book_id,
        ]);
        const book = bookRes.rows[0];

        if (book.available_quantity <= 0) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            400,
            `Cannot fulfill reservation: No copies of '${book.title}' are currently available in inventory.`
          );
        }

        // Decrement book inventory
        await client.query('UPDATE books SET available_quantity = available_quantity - 1 WHERE book_id = $1', [
          reservation.book_id,
        ]);

        // Insert issue record
        const issueInsert = await client.query(
          `INSERT INTO issue_records (book_id, student_id, issue_date, due_date, returned)
           VALUES ($1, $2, $3, $4, FALSE)
           RETURNING *`,
          [reservation.book_id, reservation.student_id, issue_date, due_date]
        );

        // Mark reservation fulfilled
        await client.query("UPDATE reservations SET status = 'FULFILLED' WHERE reservation_id = $1", [reservation_id]);

        await client.query('COMMIT');

        return sendJson(res, 200, {
          message: `Reservation fulfilled. '${reservation.book_title}' has been issued to ${reservation.student_name}.`,
          issue: issueInsert.rows[0],
          reservation_id,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (req.method === 'DELETE') {
      const queryParams = parseQuery(req);
      const body = await parseBody(req).catch(() => ({}));
      const reservation_id = parseInt(queryParams.reservation_id || body.reservation_id, 10);

      if (isNaN(reservation_id)) return sendError(res, 400, 'Valid Reservation ID is required.');

      const updateRes = await query(
        "UPDATE reservations SET status = 'CANCELLED' WHERE reservation_id = $1 AND status = 'WAITING' RETURNING *",
        [reservation_id]
      );

      if (updateRes.rows.length === 0) {
        return sendError(res, 404, 'Active waiting reservation not found.');
      }

      return sendJson(res, 200, {
        message: `Reservation #${reservation_id} has been cancelled.`,
        reservation: updateRes.rows[0],
      });
    }

    return sendError(res, 405, `Method ${req.method} not allowed.`);
  } catch (err) {
    console.error('Reservations API error:', err);
    return sendError(res, 500, 'Database error while processing reservation request.', err);
  }
}
