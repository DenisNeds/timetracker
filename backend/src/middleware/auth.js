import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export const TOKEN_COOKIE = 'token';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // stay logged in for 7 days

// httpOnly: JavaScript in the browser can't read the cookie (protects against XSS).
// sameSite 'lax': the browser won't send it on requests started by other sites (CSRF protection).
// secure: only send over HTTPS. Off by default because we run on http://localhost.
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
};

export function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
}

// Returns { id, username, role } or throws if the token is missing, forged or expired.
// Also used by the WebSocket server, which has no Express middleware.
export function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  return { id: payload.id, username: payload.username, role: payload.role };
}

// Middleware: only lets the request through if a valid login cookie is present.
// Puts the logged-in user on req.user for the route handler.
export function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Middleware: use after requireAuth. 403 = logged in, but not allowed.
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}
