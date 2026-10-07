/**
 * Pinnacle Smart Advisor — Chat Conversations Mock Data
 *
 * Production replacement point:
 *   Replace with GET /api/conversations in src/services/chatService.ts
 */

import { ChatConversation } from '../types';
import { MR_PHIRI_AVATAR, MERCY_PHIRI_AVATAR, DAVID_MWALE_AVATAR } from './assets';

export const seedChats: ChatConversation[] = [
  {
    id: 'chat-001',
    senderName: 'Chisomo Banda (Loan Officer)',
    avatarUrl: MR_PHIRI_AVATAR,
    lastMessage: 'Hi, I received your registration document. Everything looks good, let me update the status.',
    timestamp: '2 hrs ago',
    unreadCount: 1,
    isOnline: true,
  },
  {
    id: 'chat-002',
    senderName: 'Mercy Gondwe (SME Health)',
    avatarUrl: MERCY_PHIRI_AVATAR,
    lastMessage: 'Your monthly repayment has been successfully processed.',
    timestamp: '1 day ago',
    unreadCount: 0,
    isOnline: false,
  },
  {
    id: 'chat-003',
    senderName: 'Pinnacle Advisor AI',
    avatarUrl: DAVID_MWALE_AVATAR,
    lastMessage: 'Based on your recent agriculture revenue, you have low debt ratio. Let me suggest a product.',
    timestamp: '3 days ago',
    unreadCount: 0,
    isOnline: true,
  },
];

