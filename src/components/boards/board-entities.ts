'use client';
import { useQuery } from '@tanstack/react-query';
import { useActiveTeam } from '@/hooks/use-active-team';
import { api, type PageResult } from '@/lib/api-client';
import type { BoardEntityType } from '@/lib/boards';

export interface BoardEntity {
  id: string;
  name: string;
  type: BoardEntityType;
}

/** Websites, links and pixels in the current context, for picking what a widget shows. */
export function useBoardEntities() {
  const { teamId, isPending } = useActiveTeam();

  return useQuery({
    queryKey: ['boards', 'entities', teamId],
    enabled: !isPending,
    queryFn: async () => {
      const base = teamId ? `/teams/${teamId}` : '';
      const list = (kind: string) =>
        api
          .get<PageResult<{ id: string; name: string }>>(`${base}/${kind}`, { pageSize: 200 })
          .then(result => result.data)
          .catch(() => []);
      const [websites, links, pixels] = await Promise.all([
        list('websites'),
        list('links'),
        list('pixels'),
      ]);

      return [
        ...websites.map(item => ({ id: item.id, name: item.name, type: 'website' as const })),
        ...links.map(item => ({ id: item.id, name: item.name, type: 'link' as const })),
        ...pixels.map(item => ({ id: item.id, name: item.name, type: 'pixel' as const })),
      ];
    },
  });
}
