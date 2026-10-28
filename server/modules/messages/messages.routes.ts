import { Router, type Request } from 'express';
import { z } from 'zod';
import { many, one, query, transaction } from '../../db/pool';
import { forbidden, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { assertPermission } from '../../auth/permissions';
import { notifyStaffWithPermission, notifyUser } from '../notifications/notify';

/** Secure messages between a customer and Pinnacle staff. */
export const messagesRouter = Router();

async function loadConversation(req: Request, id: string) {
  const conversation = await one('SELECT * FROM conversations WHERE id = $1', [id]);
  if (!conversation) throw notFound('Conversation not found.');
  if (req.auth!.role === 'customer') {
    if (conversation.customer_user_id !== req.auth!.userId) throw notFound('Conversation not found.');
  } else {
    assertPermission(req, 'customers.view');
  }
  return conversation;
}

messagesRouter.get('/conversations', route(async (req, res) => {
  const auth = req.auth!;
  if (auth.isStaff) assertPermission(req, 'customers.view');
  const rows = await many(
    `SELECT c.id, c.subject, c.created_at, c.last_message_at, c.staff_user_id, cu.name AS customer_name, su.name AS staff_name,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_message,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id <> $1) AS unread
       FROM conversations c JOIN users cu ON cu.id = c.customer_user_id LEFT JOIN users su ON su.id = c.staff_user_id
      WHERE ($2 = 'customer' AND c.customer_user_id = $1) OR ($2 <> 'customer')
      ORDER BY c.last_message_at DESC LIMIT 200`,
    [auth.userId, auth.role],
  );
  res.json(rows.map(row => ({
    id: row.id, subject: row.subject, customerName: row.customer_name, staffName: row.staff_name, lastMessage: row.last_message,
    lastMessageAt: row.last_message_at, unread: row.unread, createdAt: row.created_at,
  })));
}));

messagesRouter.post('/conversations', route(async (req, res) => {
  const input = parse(z.object({ subject: z.string().trim().min(3).max(255), message: z.string().trim().min(1).max(5000) }), req.body);
  if (req.auth!.role !== 'customer') throw forbidden('Staff reply to conversations started by customers.');
  const id = newId('cnv');
  await transaction(async client => {
    await client.query('INSERT INTO conversations (id, customer_user_id, subject) VALUES ($1, $2, $3)', [id, req.auth!.userId, input.subject]);
    await client.query('INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ($1, $2, $3, $4)', [newId('msg'), id, req.auth!.userId, input.message]);
    await notifyStaffWithPermission('customers.view', { type: 'action', title: 'New customer message', body: `${req.auth!.fullName}: ${input.subject}`, actionRoute: `/staff/messages/${id}` }, client);
  });
  res.status(201).json({ id });
}));

messagesRouter.get('/conversations/:id/messages', route(async (req, res) => {
  const conversation = await loadConversation(req, req.params.id);
  const rows = await many(
    `SELECT m.id, m.sender_id, m.content, m.sent_at, m.read_at, u.name AS sender_name, u.role AS sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.sent_at`,
    [conversation.id],
  );
  await query('UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL', [conversation.id, req.auth!.userId]);
  res.json({
    id: conversation.id,
    subject: conversation.subject,
    messages: rows.map(row => ({
      id: row.id, mine: row.sender_id === req.auth!.userId, senderName: row.sender_role === 'customer' || req.auth!.isStaff ? row.sender_name : `${row.sender_name} (Pinnacle)`,
      fromStaff: row.sender_role !== 'customer', content: row.content, sentAt: row.sent_at, readAt: row.read_at,
    })),
  });
}));

messagesRouter.post('/conversations/:id/messages', route(async (req, res) => {
  const { content } = parse(z.object({ content: z.string().trim().min(1).max(5000) }), req.body);
  const conversation = await loadConversation(req, req.params.id);
  const id = newId('msg');
  await transaction(async client => {
    await client.query('INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ($1, $2, $3, $4)', [id, conversation.id, req.auth!.userId, content]);
    await client.query(
      `UPDATE conversations SET last_message_at = now(), staff_user_id = COALESCE(staff_user_id, CASE WHEN $2 THEN $3 END) WHERE id = $1`,
      [conversation.id, req.auth!.isStaff, req.auth!.userId],
    );
    if (req.auth!.isStaff) {
      await notifyUser(conversation.customer_user_id, { type: 'info', title: 'New message from Pinnacle', body: conversation.subject, actionRoute: `/client/messages/${conversation.id}` }, client);
    } else if (conversation.staff_user_id) {
      await notifyUser(conversation.staff_user_id, { type: 'info', title: 'Customer replied', body: conversation.subject, actionRoute: `/staff/messages/${conversation.id}` }, client);
    }
  });
  res.status(201).json({ id });
}));
