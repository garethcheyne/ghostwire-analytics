import { TriangleAlert } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

/**
 * What a list, table or chart shows when its query failed, so a server error or a dropped
 * connection isn't mistaken for "no data".
 */
export function QueryError({ error, className }: { error: unknown; className?: string }) {
  const message = error instanceof Error && error.message ? error.message : 'Something went wrong.';

  return (
    <Empty className={cn('py-8', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load this</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
