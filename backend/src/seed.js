import bcrypt from 'bcryptjs';
import { query } from './db.js';

// Creates the admin account from environment variables, if it doesn't exist yet.
// This is the only way to get an admin: registration always creates normal users.
export async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('ADMIN_USERNAME / ADMIN_PASSWORD not set, no admin account created');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // ON CONFLICT DO NOTHING: if the admin already exists, leave it alone
  const { rowCount } = await query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [username, passwordHash],
  );
  if (rowCount > 0) {
    console.log(`Created admin account "${username}"`);
  }
}
