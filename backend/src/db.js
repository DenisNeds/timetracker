import pg from 'pg';

// A pool keeps a few open connections to Postgres and reuses them,
// instead of opening a new connection for every query.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Small helper so the rest of the code can just call query(sql, params).
// Always pass values as params ($1, $2, ...) and never put them into the
// SQL string yourself: pg escapes them, which prevents SQL injection.
export function query(text, params) {
  return pool.query(text, params);
}
