'use client';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { FIELDS } from './fields';
import { formatMetricLabel } from './metric-labels';
import { WebsiteHeader } from './website-header';

type BreakdownRow = Record<string, string | number | null> & {
  views: string | number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: string | number;
};

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function FieldPicker({ value, onChange }: { value: string[]; onChange: (fields: string[]) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-64 justify-between">
          {value.length ? `${value.length} ${value.length === 1 ? 'field' : 'fields'}` : 'Choose fields'}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fields" />
          <CommandList>
            <CommandEmpty>No field found.</CommandEmpty>
            <CommandGroup>
              {FIELDS.map(field => {
                const selected = value.includes(field.name);

                return (
                  <CommandItem
                    key={field.name}
                    value={field.label}
                    onSelect={() =>
                      onChange(selected ? value.filter(v => v !== field.name) : [...value, field.name])
                    }
                  >
                    {field.label}
                    {selected && <Check className="ml-auto" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function BreakdownView() {
  const { id } = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fields = useMemo(
    () => (searchParams.get('fields') || 'path').split(',').filter(Boolean),
    [searchParams],
  );

  const setFields = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (next.length) params.set('fields', next.join(','));
    else params.delete('fields');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data, isPending } = useAnalyticsQuery<BreakdownRow[]>(
    id,
    'breakdown',
    { fields: JSON.stringify(fields) },
    { enabled: fields.length > 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Breakdown" />

      <Card>
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
          <CardDescription>Traffic for each combination of the fields you choose.</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <FieldPicker value={fields} onChange={setFields} />
            {fields.map(name => (
              <Badge key={name} variant="secondary" className="gap-1 py-1 pr-1 pl-2">
                {FIELDS.find(f => f.name === name)?.label ?? name}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-background/60"
                  aria-label={`Remove ${name}`}
                  onClick={() => setFields(fields.filter(f => f !== name))}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {!fields.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Choose at least one field.</p>
          ) : isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : !data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.map(name => (
                    <TableHead key={name}>{FIELDS.find(f => f.name === name)?.label ?? name}</TableHead>
                  ))}
                  <TableHead className="text-right">Visitors</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Bounce rate</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Visit duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, index) => {
                  const visits = Number(row.visits);

                  return (
                    <TableRow key={fields.map(f => row[f]).join('|') + index}>
                      {fields.map(name => (
                        <TableCell key={name} className="max-w-xs truncate">
                          {formatMetricLabel(name, row[name] as string | null)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">{formatLongNumber(Number(row.visitors))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatLongNumber(visits)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatLongNumber(Number(row.views))}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {Math.round(ratio(Math.min(visits, Number(row.bounces)), visits) * 100)}%
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {formatShortTime(ratio(Number(row.totaltime), visits), ['m', 's'], ' ') || '0s'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
