'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { InputGroupButton } from '@/components/ui/input-group';

/** Copy-to-clipboard button for use inside an InputGroup addon. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <InputGroupButton size="icon-xs" aria-label={label} onClick={copy}>
      {copied ? <Check /> : <Copy />}
    </InputGroupButton>
  );
}
