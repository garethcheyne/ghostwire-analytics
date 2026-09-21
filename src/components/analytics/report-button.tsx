'use client';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAnalyticsParams } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';

/**
 * Downloads the traffic report as a PDF for the current date range and filters.
 *
 * Not routed through `api-client` like the other calls: that parses JSON, and
 * this response is a file. The request still carries the session cookie, which
 * is what the route authenticates on.
 */
export function ReportButton({ websiteId, name }: { websiteId: string; name: string }) {
  const params = useAnalyticsParams();
  const { startDate, endDate } = useDateRange();
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setPending(true);

    try {
      const search = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value != null) as [string, string][],
      );
      const response = await fetch(
        `/api/websites/${websiteId}/reports/traffic?${search.toString()}`,
      );

      if (!response.ok) {
        throw new Error('The report could not be generated.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'report';

      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}-traffic-${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The report could not be generated.');
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
          onClick={handleDownload}
          disabled={pending}
          aria-label="Download traffic report"
        >
          {pending ? <Spinner /> : <FileText />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Traffic report (PDF)</TooltipContent>
    </Tooltip>
  );
}
