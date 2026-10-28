import React from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { EmptyState, ErrorState, LoadingBlock } from './Feedback';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Shown in the mobile card as the title (one column) or hidden there. */
  mobile?: 'title' | 'hidden';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: { message: string; status?: number } | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  empty?: { title: string; description?: React.ReactNode; action?: React.ReactNode };
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  pagination?: { page: number; pageSize: number; total: number; onPage: (page: number) => void };
  caption: string;
}

/**
 * Table on tablet/desktop, stacked cards on phones — no horizontal scrolling
 * is needed to reach any column or action.
 */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, onRowClick, empty, sort, onSort, pagination, caption }: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <LoadingBlock />;
  if (!rows?.length) return <EmptyState title={empty?.title ?? 'Nothing here yet'} action={empty?.action}>{empty?.description}</EmptyState>;

  const titleColumn = columns.find(column => column.mobile === 'title') ?? columns[0];
  const detailColumns = columns.filter(column => column !== titleColumn && column.mobile !== 'hidden');
  const interactive = Boolean(onRowClick);

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''} aria-busy={loading || undefined}>
      {/* Phones */}
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map(row => (
          <li key={rowKey(row)}>
            <div
              className={`block w-full px-4 py-3 text-left ${interactive ? 'cursor-pointer hover:bg-surface-muted focus-within:bg-surface-muted' : ''}`}
              onClick={interactive ? () => onRowClick!(row) : undefined}
            >
              <div className="min-w-0 font-semibold text-ink">
                {interactive ? (
                  <button type="button" className="max-w-full break-words text-left focus:outline-none" onClick={event => { event.stopPropagation(); onRowClick!(row); }}>
                    {titleColumn.render(row)}
                  </button>
                ) : titleColumn.render(row)}
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {detailColumns.map(column => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs text-ink-subtle">{column.header}</dt>
                    <dd className="break-words text-ink">{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet and desktop */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
              {columns.map(column => {
                const active = sort?.key === column.key;
                return (
                  <th key={column.key} scope="col" className={`px-4 py-2.5 font-semibold ${column.align === 'right' ? 'text-right' : ''} ${column.className ?? ''}`}
                    aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {column.sortable && onSort ? (
                      <button type="button" onClick={() => onSort(column.key)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                        {column.header}
                        {active && (sort!.direction === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(row => (
              <tr key={rowKey(row)} className={interactive ? 'cursor-pointer hover:bg-surface-muted' : ''} onClick={interactive ? () => onRowClick!(row) : undefined}
                tabIndex={interactive ? 0 : undefined} onKeyDown={interactive ? event => { if (event.key === 'Enter') onRowClick!(row); } : undefined}>
                {columns.map(column => (
                  <td key={column.key} className={`px-4 py-3 align-top text-ink ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.className ?? ''}`}>
                    <div className="break-words">{column.render(row)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > pagination.pageSize && (
        <Pagination {...pagination} />
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-ink-muted">{from}–{to} of {total.toLocaleString()}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous page">
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
