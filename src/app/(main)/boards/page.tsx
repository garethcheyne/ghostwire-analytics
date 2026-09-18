import type { Metadata } from 'next';
import { BoardsView } from '@/components/boards/boards-view';

export const metadata: Metadata = { title: 'Boards' };

export default function BoardsPage() {
  return <BoardsView />;
}
