import { getClient } from './db.js';
import { sendJson, sendError, parseBody } from './utils.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, `Method ${req.method} not allowed.`);
  }

  try {
    const body = await parseBody(req);
    const issue_id = body.issue_id ? parseInt(body.issue_id, 10) : null;
    const student_id = body.student_id ? parseInt(body.student_id, 10) : null;
    const book_id = body.book_id ? parseInt(body.book_id, 10) : null;

    if (!issue_id && (!student_id || !book_id)) {
      return sendError(res, 400, 'Either issue_id OR both student_id and book_id are required to process a return.');
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      let issueQuery = `
        SELECT ir.*, b.title AS book_title, s.student_name
        FROM issue_records ir
        JOIN books b ON ir.book_id = b.book_id
        JOIN students s ON ir.student_id = s.student_id
        WHERE ir.returned = FALSE
      `;
      const issueParams = [];

      if (issue_id) {
        issueQuery += ' AND ir.issue_id = $1';
        issueParams.push(issue_id);
      } else {
        issueQuery += ' AND ir.student_id = $1 AND ir.book_id = $2';
        issueParams.push(student_id, book_id);
      }
      issueQuery += ' FOR UPDATE OF ir';

      const issueRes = await client.query(issueQuery, issueParams);
      if (issueRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'No active issue record found for the provided details.');
      }

      const activeRecord = issueRes.rows[0];

      // Mark record returned
      await client.query('UPDATE issue_records SET returned = TRUE WHERE issue_id = $1', [activeRecord.issue_id]);

      // Lock book row
      const bookRes = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [activeRecord.book_id]);
      if (bookRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'Book record missing in database.');
      }
      const book = bookRes.rows[0];

      if (book.available_quantity >= book.total_quantity) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'Cannot return book: available quantity already equals total inventory.');
      }

      // Increment available quantity
      await client.query('UPDATE books SET available_quantity = available_quantity + 1 WHERE book_id = $1', [
        activeRecord.book_id,
      ]);

      // Check next student in FIFO reservation queue
      const nextQueueRes = await client.query(
        `SELECT r.reservation_id, r.student_id, s.student_name, s.course, r.reserved_at
         FROM reservations r
         JOIN students s ON r.student_id = s.student_id
         WHERE r.book_id = $1 AND r.status = 'WAITING'
         ORDER BY r.reservation_id ASC
         LIMIT 1`,
        [activeRecord.book_id]
      );

      const nextInQueue = nextQueueRes.rows.length > 0 ? nextQueueRes.rows[0] : null;

      await client.query('COMMIT');

      return sendJson(res, 200, {
        message: `Book '${activeRecord.book_title}' successfully returned by ${activeRecord.student_name}.`,
        issue_id: activeRecord.issue_id,
        book_id: activeRecord.book_id,
        available_quantity: book.available_quantity + 1,
        total_quantity: book.total_quantity,
        next_in_queue: nextInQueue,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Return API error:', err);
    return sendError(res, 500, 'Database error while returning book.', err);
  }
}
