/**
 * Pinnacle Smart Advisor — Alert Notifications Mock Data
 *
 * Production replacement point:
 *   Replace with GET /api/alerts in src/services/notificationService.ts
 */

import type { AlertNotification } from '../types';

export const seedAlertNotifications: AlertNotification[] = [
  {
    id: 'alert-001',
    type: 'critical',
    title: 'High Default Risk Signal',
    description: 'Samuel Chimwala (APP-88421) agricultural loan shows abnormal cashflow patterns in Q3.',
    date: '10 mins ago',
    imageBackground: 'rgba(239, 68, 68, 0.1)',
    actionLabel: 'Review Risk',
  },
  {
    id: 'alert-002',
    type: 'approval',
    title: 'Loan Pre-Approved',
    description: 'Kondwani Msiska (APP-348211) qualifies for construction sector tranche expansion.',
    date: '1 hr ago',
    imageBackground: 'rgba(16, 185, 129, 0.1)',
    actionLabel: 'View Details',
  },
  {
    id: 'alert-003',
    type: 'opportunity',
    title: 'New SME Grant Program',
    description: 'Agricultural inputs sector grants now open. Select matching clients for invite.',
    date: '2 hrs ago',
    imageBackground: 'rgba(245, 158, 11, 0.1)',
    actionLabel: 'Match Clients',
  },
  {
    id: 'alert-004',
    type: 'warning',
    title: 'Pending Document Expiry',
    description: 'Blessings Kamau tax clearance certificate expires in 14 days.',
    date: '1 day ago',
    imageBackground: 'rgba(239, 68, 68, 0.1)',
    actionLabel: 'Notify Client',
  },
];
