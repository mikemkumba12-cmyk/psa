import { Router } from 'express';
import { many, one, query } from '../../db/pool';
import { route } from '../../lib/http';
import { emailConfigured, smsConfigured } from './channels';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', route(async (req, res) => {
  const rows = await many(
    `SELECT id, type, title, body, action_route, entity_type, entity_id, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.auth!.userId],
  );
  const unread = await one<{ count: number }>(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [req.auth!.userId],
  );
  res.json({
    unreadCount: unread?.count ?? 0,
    items: rows.map(row => ({
      id: row.id, type: row.type, title: row.title, body: row.body, actionRoute: row.action_route,
      entityType: row.entity_type, entityId: row.entity_id, readAt: row.read_at, createdAt: row.created_at,
    })),
  });
}));

notificationsRouter.post('/notifications/:id/read', route(async (req, res) => {
  await query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [req.params.id, req.auth!.userId]);
  res.status(204).end();
}));

notificationsRouter.post('/notifications/read-all', route(async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.auth!.userId]);
  res.status(204).end();
}));

/** Which delivery channels actually work on this server, so the settings screen can be honest. */
notificationsRouter.get('/notifications/channels', route(async (_req, res) => {
  res.json({ inApp: true, email: emailConfigured(), sms: smsConfigured() });
}));
