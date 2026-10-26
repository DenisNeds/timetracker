import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getStats } from '../tracking/visits.js';

const router = Router();

// GET /api/stats — a user gets only their own stats, an admin gets everyone's.
// The role comes from the verified token, so a user can't ask for more.
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const users = await getStats(isAdmin ? null : req.user.id);
  res.json({ scope: isAdmin ? 'all' : 'own', users });
}));

export default router;
