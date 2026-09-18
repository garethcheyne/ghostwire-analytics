'use client';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OPERATORS } from '@/lib/constants';
import { FIELDS } from './fields';

export interface FilterRow {
  name: string;
  operator: string;
  value: string;
}

export const FILTER_OPERATORS = [
  { value: OPERATORS.equals, label: 'is' },
  { value: OPERATORS.notEquals, label: 'is not' },
  { value: OPERATORS.contains, label: 'contains' },
  { value: OPERATORS.doesNotContain, label: 'does not contain' },
];

export const emptyFilter = (): FilterRow => ({ name: 'path', operator: OPERATORS.equals, value: '' });

/** Editable list of field/operator/value filters. */
export function FilterRows({
  rows,
  onChange,
  allowEmpty = true,
}: {
  rows: FilterRow[];
  onChange: (rows: FilterRow[]) => void;
  allowEmpty?: boolean;
}) {
  const update = (index: number, change: Partial<FilterRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Select value={row.name} onValueChange={name => update(index, { name })}>
            <SelectTrigger className="w-36" aria-label="Field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FIELDS.map(field => (
                  <SelectItem key={field.name} value={field.name}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={row.operator} onValueChange={operator => update(index, { operator })}>
            <SelectTrigger className="w-40" aria-label="Operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FILTER_OPERATORS.map(op => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            value={row.value}
            onChange={event => update(index, { value: event.target.value })}
            placeholder="Value"
            aria-label="Value"
            className="min-w-40 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove filter"
            disabled={!allowEmpty && rows.length <= 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, emptyFilter()])}
      >
        <Plus data-icon="inline-start" />
        Add filter
      </Button>
    </div>
  );
}
