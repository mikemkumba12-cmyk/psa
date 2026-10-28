import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api/client';
import type { NotificationItem } from '../../api/types';
import { dateTime } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingBlock } from '../../ui/Feedback';
import { Card, PageHeader } from '../../ui/Layout';

export function NotificationsPage() {
  const { data, error, loading, reload } = useResource<{ unreadCount: number; items: NotificationItem[] }>('/api/notifications');
  const outlet = useOutletContext<{ refreshNotifications?: () => void } | undefined>();
  const markAll = async () => {
    await api('/api/notifications/read-all', { method: 'POST' });
    await reload();
    outlet?.refreshNotifications?.();
  };
  const open = async (item: NotificationItem) => {
    if (!item.readAt) {
      await api(`/api/notifications/${item.id}/read`, { method: 'POST' });
      outlet?.refreshNotifications?.();
    }
  };
  return (
    <>
      <PageHeader title="Notifications" actions={data && data.unreadCount > 0 && <Button variant="secondary" onClick={markAll}>Mark all as read</Button>} />
      <Card padded={false}>
        {error && <ErrorState error={error} onRetry={reload} />}
        {loading && !data && <LoadingBlock />}
        {data?.items.length === 0 && <EmptyState title="You’re all caught up" />}
        <ul className="divide-y divide-line">
          {data?.items.map(item => {
            const body = (
              <div className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-brand-600'}`} aria-label={item.readAt ? undefined : 'Unread'} />
                <div className="min-w-0">
                  <p className={`text-sm ${item.readAt ? 'text-ink' : 'font-semibold text-ink'}`}>{item.title}</p>
                  {item.body && <p className="break-words text-sm text-ink-muted">{item.body}</p>}
                  <p className="mt-0.5 text-xs text-ink-subtle">{dateTime(item.createdAt)}</p>
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.actionRoute
                  ? <Link to={item.actionRoute} onClick={() => open(item)} className="block px-4 py-3 hover:bg-surface-muted">{body}</Link>
                  : <button type="button" onClick={() => open(item)} className="block w-full px-4 py-3 text-left hover:bg-surface-muted">{body}</button>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
