'use client';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BoardComponentConfig, BoardParameters, BoardRow } from '@/lib/types';
import { useBoardEntities } from './board-entities';
import { WidgetDialog } from './widget-dialog';
import { BoardWidget } from './widgets';

const MAX_COLUMNS = 3;

const newId = () => crypto.randomUUID();

const GRID_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 lg:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-3',
};

type Editing = { rowId: string; columnId?: string } | null;

/**
 * Rows of up to three widgets. In edit mode rows can be added, moved and removed, and widgets
 * added, edited and removed; changes go to onChange (the caller saves).
 */
export function BoardCanvas({
  parameters,
  editing,
  onChange,
  entityNames,
}: {
  parameters: BoardParameters;
  editing: boolean;
  onChange?: (parameters: BoardParameters) => void;
  /** Names by id, when the viewer can't list websites (public shares). */
  entityNames?: Record<string, string>;
}) {
  const { data: entities } = useBoardEntities({ enabled: !entityNames });
  const [dialog, setDialog] = useState<Editing>(null);
  const rows = parameters.rows ?? [];
  const names = new Map(
    entityNames ? Object.entries(entityNames) : entities?.map(entity => [entity.id, entity.name]),
  );

  const setRows = (next: BoardRow[]) => onChange?.({ ...parameters, rows: next });

  const updateRow = (rowId: string, change: (row: BoardRow) => BoardRow) =>
    setRows(rows.map(row => (row.id === rowId ? change(row) : row)));

  const moveRow = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    setRows(next);
  };

  const saveWidget = (config: BoardComponentConfig) => {
    if (!dialog) return;

    updateRow(dialog.rowId, row =>
      dialog.columnId
        ? {
            ...row,
            columns: row.columns.map(column =>
              column.id === dialog.columnId ? { ...column, component: config } : column,
            ),
          }
        : { ...row, columns: [...row.columns, { id: newId(), component: config }] },
    );
  };

  const dialogInitial = dialog?.columnId
    ? rows
        .find(row => row.id === dialog.rowId)
        ?.columns.find(column => column.id === dialog.columnId)?.component
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={cn('flex flex-col gap-2', editing && 'rounded-lg border border-dashed p-3')}
        >
          {editing && (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move row up"
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move row down"
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete row"
                onClick={() => setRows(rows.filter(item => item.id !== row.id))}
              >
                <Trash2 />
              </Button>
            </div>
          )}
          <div
            className={cn(
              'grid gap-6 *:min-w-0',
              GRID_COLUMNS[
                Math.min(
                  MAX_COLUMNS,
                  row.columns.length + (editing && row.columns.length < MAX_COLUMNS ? 1 : 0),
                ) || 1
              ],
            )}
          >
            {row.columns.map(column => (
              <div key={column.id} className="relative flex flex-col">
                {column.component && (
                  <BoardWidget
                    config={column.component}
                    entityName={names.get(
                      column.component.entityId ?? column.component.websiteId ?? '',
                    )}
                  />
                )}
                {editing && (
                  <div className="absolute top-2 right-2 flex gap-1 rounded-md border bg-background/95 p-0.5 shadow-sm">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit widget"
                      onClick={() => setDialog({ rowId: row.id, columnId: column.id })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove widget"
                      onClick={() =>
                        updateRow(row.id, current => ({
                          ...current,
                          columns: current.columns.filter(item => item.id !== column.id),
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {editing && row.columns.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={() => setDialog({ rowId: row.id })}
                className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <Plus className="size-5" />
                Add widget
              </button>
            )}
          </div>
        </div>
      ))}

      {editing && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setRows([...rows, { id: newId(), columns: [] }])}
        >
          <Plus data-icon="inline-start" />
          Add row
        </Button>
      )}

      {dialog && (
        <WidgetDialog
          key={`${dialog.rowId}:${dialog.columnId ?? 'new'}`}
          open
          onOpenChange={open => !open && setDialog(null)}
          initial={dialogInitial}
          onSave={saveWidget}
        />
      )}
    </div>
  );
}
