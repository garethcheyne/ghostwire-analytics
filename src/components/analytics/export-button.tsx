'use client';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAnalyticsParams } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { api } from '@/lib/api-client';

/** Downloads a zip of CSVs (pages, referrers, events...) for the current date range and filters. */
export function ExportButton({ websiteId, name }: { websiteId: string; name: string }) {
  const params = useAnalyticsParams();
  const { startDate, endDate } = useDateRange();
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);

    try {
      const { zip } = await api.get<{ zip: string }>(`/websites/${websiteId}/export`, params);
      const bytes = Uint8Array.from(atob(zip), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'export';
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}-${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleExport}
          disabled={pending}
          aria-label="Export CSV"
        >
          {pending ? <Spinner /> : <Download />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Export as CSV (zip)</TooltipContent>
    </Tooltip>
  );
}
