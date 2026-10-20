import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import {
  requireAuth, setAuthCookie, clearAuthCookie, verifyToken, TOKEN_COOKIE,
} from '../middleware/auth.js';
import { endUserVisits } from '../tracking/visits.js';

const router = Router();

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores everything after 72 bytes
const BCRYPT_ROUNDS = 10; // cost factor: higher = slower to hash = harder to brute force

// Never send password_hash to the browser
function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role };
}

// POST /api/auth/register  { username, password }
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters: letters, numbers or _' });
  }
  if (typeof password !== 'string'
    || password.length < MIN_PASSWORD_LENGTH
    || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    // New users always get the default role 'user'; admins come only from the seed
    const { rows } = await query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role',
      [username, passwordHash],
    );
    user = rows[0];
  } catch (err) {
    // 23505 = Postgres "unique_violation": the UNIQUE constraint on username
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username is already taken' });
    }
    throw err;
  }

  setAuthCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

// POST /api/auth/login  { username, password }
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const { rows } = await query(
    'SELECT id, username, role, password_hash FROM users WHERE username = $1',
    [username],
  );
  const user = rows[0];
  const passwordOk = user && await bcrypt.compare(password, user.password_hash);

  // Same message for "no such user" and "wrong password", so an attacker
  // can't use the login form to find out which usernames exist.
  if (!passwordOk) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/logout — stops time tracking and clears the cookie.
// Doesn't use requireAuth: logging out with an expired token should still work.
router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies[TOKEN_COOKIE];
  if (token) {
    try {
      const user = verifyToken(token);
      await endUserVisits(user.id);
    } catch {
      // invalid or expired token: nothing to stop, just clear the cookie
    }
  }
  clearAuthCookie(res);
  res.json({ ok: true });
}));

// GET /api/auth/me — who is logged in? The frontend calls this on page load.
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  // Read from the DB (not just the token) in case the user was deleted
  const { rows } = await query('SELECT id, username, role FROM users WHERE id = $1', [req.user.id]);
  if (rows.length === 0) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'User no longer exists' });
  }
  res.json({ user: publicUser(rows[0]) });
}));

export default router;
