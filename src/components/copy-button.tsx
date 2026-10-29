'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InputGroupButton } from '@/components/ui/input-group';

/** Copy-to-clipboard button for use inside an InputGroup addon. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard access (http, or permission refused): the value is still on screen.
      toast.error('Could not copy. Select the text and copy it instead.');
    }
  }

  return (
    <InputGroupButton size="icon-xs" aria-label={label} onClick={copy}>
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  );
}
