'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/**
 * Copies markup to the clipboard as *rich HTML* rather than as text.
 *
 * This is the difference between a signature editor showing an invisible
 * tracking image and showing the literal characters `<img src="...">`.
 * Outlook, Gmail and Apple Mail all paste whatever flavour of the clipboard
 * they understand best: given `text/html` they render it, given only
 * `text/plain` they escape it.
 *
 * Both flavours go on the clipboard together, so pasting into a code editor
 * or a plain-text field still gives the source.
 *
 * `ClipboardItem` needs a secure context (https, or localhost) and is missing
 * in a few older browsers, so a plain-text copy is kept as the fallback — the
 * snippet is still usable, it just has to be pasted somewhere that accepts
 * HTML source.
 */
export function CopyHtmlButton({
  html,
  label = 'Copy for email signature',
  variant = 'default',
}: {
  html: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([html], { type: 'text/plain' }),
          }),
        ]);
        toast.success('Copied. Paste it into your signature.');
      } else {
        await navigator.clipboard.writeText(html);
        toast.success('Copied as text.', {
          description:
            'This browser cannot copy formatted HTML. Paste it where HTML source is accepted.',
        });
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Denied permission, or not a secure context. Say so rather than
      // leaving the button looking like it worked.
      toast.error('Could not copy', {
        description: 'Select the code above and copy it by hand.',
      });
    }
  }

  return (
    <Button variant={variant} onClick={copy}>
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {label}
    </Button>
  );
}
