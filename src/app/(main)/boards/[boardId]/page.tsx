import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BoardDetail } from '@/components/boards/boards-view';

export const metadata: Metadata = { title: 'Board' };

export default async function BoardPage({ params, searchParams }: PageProps<'/boards/[boardId]'>) {
  const { boardId } = await params;
  const { edit } = await searchParams;

  return (
    <Suspense>
      <BoardDetail boardId={boardId} startEditing={edit === '1'} />
    </Suspense>
  );
}
