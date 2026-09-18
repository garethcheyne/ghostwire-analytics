import { formatLongNumber } from '@/lib/format';

export interface BarListRow {
  key: string;
  label: React.ReactNode;
  value: number;
}

/** Ranked rows with a proportional bar behind each, plus value and share. */
export function BarList({
  rows,
  format = formatLongNumber,
  showShare = true,
  empty = 'No data for this period.',
}: {
  rows: BarListRow[];
  format?: (value: number) => string;
  showShare?: boolean;
  empty?: string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const max = Math.max(1, ...rows.map(row => row.value));

  return (
    <ul className="flex flex-col gap-1">
      {rows.map(row => (
        <li key={row.key} className="relative">
          <div
            className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
            style={{ width: `${(row.value / max) * 100}%` }}
            aria-hidden
          />
          <div className="relative flex items-center gap-3 px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span className="font-medium tabular-nums">{format(row.value)}</span>
            {showShare && (
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {Math.round((row.value / total) * 100)}%
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
