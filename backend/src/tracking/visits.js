import { pool, query } from '../db.js';

export const PAGES = ['home', 'articles', 'stats'];

// Starts a new visit of `page` for the user and returns its id.
// Any visit the user still has open (e.g. in another tab) is closed first,
// so a user is only ever "on" one page at a time.
export async function startVisit(userId, page) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock this user's row until COMMIT. If two tabs start a visit at the
    // same moment, the second waits here until the first is finished,
    // instead of both inserting an open visit at once.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    await client.query(
      `UPDATE page_visits SET ended_at = now(), last_seen_at = now()
       WHERE user_id = $1 AND ended_at IS NULL`,
      [userId],
    );
    const { rows } = await client.query(
      'INSERT INTO page_visits (user_id, page) VALUES ($1, $2) RETURNING id',
      [userId, page],
    );
    await client.query('COMMIT');
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Heartbeat: "the user is still here". Returns false if the visit is no
// longer open (another tab took over, or the user logged out).
export async function touchVisit(visitId) {
  const { rowCount } = await query(
    'UPDATE page_visits SET last_seen_at = now() WHERE id = $1 AND ended_at IS NULL',
    [visitId],
  );
  return rowCount > 0;
}

// Ends one visit. Use endAt = 'now' when we know the user just left
// (navigated away, closed the tab), and 'lastSeen' when the connection died
// silently: then we only count time up to the last heartbeat we received.
export async function endVisit(visitId, endAt = 'now') {
  const endExpr = endAt === 'lastSeen' ? 'last_seen_at' : 'now()';
  await query(
    `UPDATE page_visits SET ended_at = ${endExpr}, last_seen_at = ${endExpr}
     WHERE id = $1 AND ended_at IS NULL`,
    [visitId],
  );
}

// Ends whatever visit the user has open. Used on logout.
export async function endUserVisits(userId) {
  await query(
    `UPDATE page_visits SET ended_at = now(), last_seen_at = now()
     WHERE user_id = $1 AND ended_at IS NULL`,
    [userId],
  );
}

// Called once at server start. Any visit still open now was left behind by a
// crash or restart (no client can be connected yet), so close it at the last
// heartbeat we received. That way downtime is never counted as time on a page.
export async function closeStaleVisits() {
  const { rowCount } = await query(
    'UPDATE page_visits SET ended_at = last_seen_at WHERE ended_at IS NULL',
  );
  if (rowCount > 0) {
    console.log(`Closed ${rowCount} visit(s) left open by a previous run`);
  }
}
