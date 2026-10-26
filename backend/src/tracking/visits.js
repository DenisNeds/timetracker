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

// User activity: "the user is still here", so last_seen_at always holds the
// last moment we know the user was active. Returns false if the visit is no
// longer open (another tab took over, or the user logged out).
export async function touchVisit(visitId) {
  const { rowCount } = await query(
    'UPDATE page_visits SET last_seen_at = now() WHERE id = $1 AND ended_at IS NULL',
    [visitId],
  );
  return rowCount > 0;
}

// Ends one visit. Use endAt = 'now' when we know the user just left
// (navigated away, closed the tab), and 'lastSeen' when the user went idle or
// the connection died silently: then we only count time up to their last activity.
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
// crash or restart (no client can be connected yet), so close it at the
// user's last activity. That way downtime is never counted as time on a page.
export async function closeStaleVisits() {
  const { rowCount } = await query(
    'UPDATE page_visits SET ended_at = last_seen_at WHERE ended_at IS NULL',
  );
  if (rowCount > 0) {
    console.log(`Closed ${rowCount} visit(s) left open by a previous run`);
  }
}

// Total time per page, per user. Pass a userId for one user, or nothing for all users.
// Returns [{ userId, username, role, totalSeconds,
//            pages: { home: { seconds, active }, articles: {...}, stats: {...} } }]
// "active" = the user is on that page right now, so its time is still growing.
export async function getStats(userId = null) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.username, u.role, p.page,
            -- open visits (ended_at IS NULL) count up to this moment
            COALESCE(EXTRACT(EPOCH FROM SUM(COALESCE(v.ended_at, now()) - v.started_at)), 0)::float8
              AS seconds,
            -- v.id IS NOT NULL: a page with no visits still gets one LEFT JOIN
            -- row full of NULLs, and that row must not count as an open visit
            COALESCE(BOOL_OR(v.id IS NOT NULL AND v.ended_at IS NULL), false) AS active
     FROM users u
     -- every user x every page, so pages with no visits still show up as 0
     CROSS JOIN unnest($2::text[]) AS p(page)
     LEFT JOIN page_visits v ON v.user_id = u.id AND v.page = p.page
     WHERE $1::int IS NULL OR u.id = $1
     GROUP BY u.id, u.username, u.role, p.page
     ORDER BY u.username, array_position($2::text[], p.page)`,
    [userId, PAGES],
  );

  // One row per (user, page) -> one object per user
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        username: row.username,
        role: row.role,
        totalSeconds: 0,
        pages: {},
      });
    }
    const user = byUser.get(row.user_id);
    user.pages[row.page] = { seconds: row.seconds, active: row.active };
    user.totalSeconds += row.seconds;
  }
  return [...byUser.values()];
}
