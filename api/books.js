import { query, getClient } from './db.js';
import { sendJson, sendError, parseBody, parseQuery } from './utils.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      const q = parseQuery(req).q?.trim();
      let sql = `
        SELECT 
          b.book_id,
          b.title,
          b.author,
          b.category,
          b.total_quantity,
          b.available_quantity,
          (b.total_quantity - b.available_quantity) AS issued_quantity,
          COALESCE(r.waiting_reservations, 0) AS waiting_reservations
        FROM books b
        LEFT JOIN (
          SELECT book_id, COUNT(*) AS waiting_reservations
          FROM reservations
          WHERE status = 'WAITING'
          GROUP BY book_id
        ) r ON b.book_id = r.book_id
      `;
      const params = [];

      if (q) {
        const isNum = !isNaN(parseInt(q, 10));
        if (isNum) {
          sql += ` WHERE b.book_id = $1 OR b.title ILIKE $2 OR b.author ILIKE $2 OR b.category ILIKE $2`;
          params.push(parseInt(q, 10), `%${q}%`);
        } else {
          sql += ` WHERE b.title ILIKE $1 OR b.author ILIKE $1 OR b.category ILIKE $1`;
          params.push(`%${q}%`);
        }
      }

      sql += ` ORDER BY b.book_id ASC`;

      const result = await query(sql, params);
      return sendJson(res, 200, { books: result.rows });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const book_id = parseInt(body.book_id, 10);
      const title = (body.title || '').trim();
      const author = (body.author || '').trim();
      const category = (body.category || '').trim();
      const total_quantity = parseInt(body.total_quantity, 10);

      if (isNaN(book_id) || book_id <= 0) {
        return sendError(res, 400, 'A valid positive Book ID is required.');
      }
      if (!title) return sendError(res, 400, 'Book title cannot be empty.');
      if (!author) return sendError(res, 400, 'Author cannot be empty.');
      if (!category) return sendError(res, 400, 'Category cannot be empty.');
      if (isNaN(total_quantity) || total_quantity <= 0) {
        return sendError(res, 400, 'Total quantity must be greater than zero.');
      }

      // Check duplicate
      const existing = await query('SELECT book_id FROM books WHERE book_id = $1', [book_id]);
      if (existing.rows.length > 0) {
        return sendError(res, 409, `A book with ID ${book_id} already exists.`);
      }

      const insertResult = await query(
        `INSERT INTO books (book_id, title, author, category, total_quantity, available_quantity)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING *`,
        [book_id, title, author, category, total_quantity]
      );

      return sendJson(res, 201, { book: insertResult.rows[0], message: 'Book added successfully.' });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const book_id = parseInt(body.book_id, 10);
      const title = (body.title || '').trim();
      const author = (body.author || '').trim();
      const category = (body.category || '').trim();
      const new_total = parseInt(body.total_quantity, 10);

      if (isNaN(book_id)) return sendError(res, 400, 'Valid Book ID is required.');
      if (!title || !author || !category) return sendError(res, 400, 'Title, Author, and Category cannot be empty.');
      if (isNaN(new_total) || new_total <= 0) return sendError(res, 400, 'Total quantity must be greater than zero.');

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const currentRes = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [book_id]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return sendError(res, 404, 'Book not found.');
        }

        const current = currentRes.rows[0];
        const currentlyIssued = current.total_quantity - current.available_quantity;

        if (new_total < currentlyIssued) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            400,
            `Cannot reduce total quantity to ${new_total}. Currently ${currentlyIssued} copies are issued to students.`
          );
        }

        const new_available = new_total - currentlyIssued;

        const updateRes = await client.query(
          `UPDATE books 
           SET title = $1, author = $2, category = $3, total_quantity = $4, available_quantity = $5
           WHERE book_id = $6
           RETURNING *`,
          [title, author, category, new_total, new_available, book_id]
        );

        await client.query('COMMIT');
        return sendJson(res, 200, { book: updateRes.rows[0], message: 'Book updated successfully.' });
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
      const book_id = parseInt(queryParams.book_id || body.book_id, 10);

      if (isNaN(book_id)) return sendError(res, 400, 'Valid Book ID is required.');

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const bookRes = await client.query('SELECT * FROM books WHERE book_id = $1 FOR UPDATE', [book_id]);
        if (bookRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return sendError(res, 404, 'Book not found.');
        }

        const book = bookRes.rows[0];

        // Safeguard 1: check active issues
        const activeIssues = await client.query(
          'SELECT COUNT(*) FROM issue_records WHERE book_id = $1 AND returned = FALSE',
          [book_id]
        );
        if (parseInt(activeIssues.rows[0].count, 10) > 0) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            400,
            `Cannot delete: this book has active issue records (${activeIssues.rows[0].count} copies currently borrowed).`
          );
        }

        // Safeguard 2: check consistency
        if (book.available_quantity !== book.total_quantity) {
          await client.query('ROLLBACK');
          return sendError(res, 400, 'Cannot delete: inventory records are inconsistent with total copies.');
        }

        // Safeguard 3: Cancel waiting reservations
        await client.query("UPDATE reservations SET status = 'CANCELLED' WHERE book_id = $1 AND status = 'WAITING'", [
          book_id,
        ]);

        // Clean up completed historical reservations/issues or cascade
        await client.query('DELETE FROM reservations WHERE book_id = $1', [book_id]);
        await client.query('DELETE FROM issue_records WHERE book_id = $1', [book_id]);
        await client.query('DELETE FROM books WHERE book_id = $1', [book_id]);

        await client.query('COMMIT');
        return sendJson(res, 200, { message: `Book '${book.title}' (ID ${book_id}) deleted successfully.` });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return sendError(res, 405, `Method ${req.method} not allowed.`);
  } catch (err) {
    console.error('Books API error:', err);
    return sendError(res, 500, 'Database error while processing books request.', err);
  }
}
