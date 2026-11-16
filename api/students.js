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
          s.student_id,
          s.student_name,
          s.course,
          COALESCE(i.active_loans, 0) AS active_loans,
          COALESCE(r.active_reservations, 0) AS active_reservations
        FROM students s
        LEFT JOIN (
          SELECT student_id, COUNT(*) AS active_loans
          FROM issue_records
          WHERE returned = FALSE
          GROUP BY student_id
        ) i ON s.student_id = i.student_id
        LEFT JOIN (
          SELECT student_id, COUNT(*) AS active_reservations
          FROM reservations
          WHERE status = 'WAITING'
          GROUP BY student_id
        ) r ON s.student_id = r.student_id
      `;
      const params = [];

      if (q) {
        const isNum = !isNaN(parseInt(q, 10));
        if (isNum) {
          sql += ` WHERE s.student_id = $1 OR s.student_name ILIKE $2 OR s.course ILIKE $2`;
          params.push(parseInt(q, 10), `%${q}%`);
        } else {
          sql += ` WHERE s.student_name ILIKE $1 OR s.course ILIKE $1`;
          params.push(`%${q}%`);
        }
      }

      sql += ` ORDER BY s.student_id ASC`;

      const result = await query(sql, params);
      return sendJson(res, 200, { students: result.rows });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const student_id = parseInt(body.student_id, 10);
      const student_name = (body.student_name || '').trim();
      const course = (body.course || '').trim();

      if (isNaN(student_id) || student_id <= 0) {
        return sendError(res, 400, 'A valid positive Student ID is required.');
      }
      if (!student_name) return sendError(res, 400, 'Student name cannot be empty.');
      if (!course) return sendError(res, 400, 'Course cannot be empty.');

      const existing = await query('SELECT student_id FROM students WHERE student_id = $1', [student_id]);
      if (existing.rows.length > 0) {
        return sendError(res, 409, `A student with ID ${student_id} already exists.`);
      }

      const insertResult = await query(
        `INSERT INTO students (student_id, student_name, course)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [student_id, student_name, course]
      );

      return sendJson(res, 201, {
        student: insertResult.rows[0],
        message: 'Student registered successfully.',
      });
    }

    if (req.method === 'DELETE') {
      const queryParams = parseQuery(req);
      const body = await parseBody(req).catch(() => ({}));
      const student_id = parseInt(queryParams.student_id || body.student_id, 10);

      if (isNaN(student_id)) return sendError(res, 400, 'Valid Student ID is required.');

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const activeIssues = await client.query(
          'SELECT COUNT(*) FROM issue_records WHERE student_id = $1 AND returned = FALSE',
          [student_id]
        );

        if (parseInt(activeIssues.rows[0].count, 10) > 0) {
          await client.query('ROLLBACK');
          return sendError(res, 400, 'Cannot delete student who currently has active issued books.');
        }

        // Cancel waiting reservations
        await client.query("UPDATE reservations SET status = 'CANCELLED' WHERE student_id = $1 AND status = 'WAITING'", [
          student_id,
        ]);
        await client.query('DELETE FROM reservations WHERE student_id = $1', [student_id]);
        await client.query('DELETE FROM issue_records WHERE student_id = $1', [student_id]);
        await client.query('DELETE FROM students WHERE student_id = $1', [student_id]);

        await client.query('COMMIT');
        return sendJson(res, 200, { message: `Student ID ${student_id} removed successfully.` });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return sendError(res, 405, `Method ${req.method} not allowed.`);
  } catch (err) {
    console.error('Students API error:', err);
    return sendError(res, 500, 'Database error while processing student request.', err);
  }
}
