'use client';
import { Info, TriangleAlert } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { CopyHtmlButton } from '@/components/copy-html-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * The snippet people paste.
 *
 * Deliberately *not* `display:none`: several mail clients skip loading an
 * image that is hidden that way, and hiding content is one of the things spam
 * filters score against. A 1x1 transparent GIF with no border is invisible
 * enough in a signature without any of that.
 */
export function pixelSnippet(url: string) {
  return `<img src="${url}" width="1" height="1" alt="" style="border:0;width:1px;height:1px" />`;
}

const CLIENTS = [
  {
    value: 'outlook',
    label: 'Outlook',
    steps: [
      'File → Options → Mail → Signatures (in new Outlook: Settings → Accounts → Signatures).',
      'Pick the signature you want to track and click into the editing box.',
      'Put the cursor at the very end of the signature, then paste.',
      'Save. Nothing appears to change — the image is one transparent pixel.',
    ],
    note: 'Outlook on Windows must be in HTML mode, not Plain Text. Plain-text mail carries no images, so nothing is counted.',
  },
  {
    value: 'gmail',
    label: 'Gmail',
    steps: [
      'Settings (gear) → See all settings → General → Signature.',
      'Select the signature and place the cursor at the end of it.',
      'Paste, then Save Changes at the bottom of the page.',
    ],
    note: 'Gmail serves the image through its own proxy, so the open is recorded from Google, not from the reader. Location and device for those opens are Google’s, not theirs.',
  },
  {
    value: 'apple',
    label: 'Apple Mail',
    steps: [
      'Mail → Settings → Signatures.',
      'Select the signature, click into the preview pane and put the cursor at the end.',
      'Paste. The change saves itself when you close the window.',
    ],
    note: 'Untick “Always match my default message font” first, or Apple Mail may strip the HTML as it pastes.',
  },
  {
    value: 'other',
    label: 'Other',
    steps: [
      'Open your signature editor and make sure it is in HTML or rich-text mode.',
      'If it has a “source”, “code” or “<>” view, paste the code there.',
      'Otherwise put the cursor at the end of the signature and paste normally.',
    ],
    note: 'Any editor that only accepts plain text cannot carry a pixel — the address would show up as visible text.',
  },
];

/**
 * How to use a pixel, and — just as importantly — what it cannot tell you.
 *
 * People reach for a signature pixel expecting per-email read receipts. One
 * pixel cannot do that, and a help panel that glosses over it produces
 * confident wrong conclusions about real conversations, so the limits are
 * stated as plainly as the instructions.
 */
export function PixelEmbed({ url, name }: { url: string; name: string }) {
  const snippet = pixelSnippet(url);
  const taggedUrl = `${url}?to=someone@example.com`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add this pixel to an email signature</CardTitle>
          <CardDescription>
            An invisible 1×1 image. Each time a mail client loads it, a view is counted against{' '}
            {name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <InputGroup>
              <InputGroupTextarea
                value={snippet}
                readOnly
                rows={2}
                className="font-mono text-xs"
                aria-label="Pixel embed code"
              />
              <InputGroupAddon align="block-end" className="justify-end">
                <CopyButton value={snippet} label="Copy the code itself" />
              </InputGroupAddon>
            </InputGroup>
            <div className="flex flex-wrap items-center gap-3">
              <CopyHtmlButton html={snippet} />
              <p className="text-sm text-muted-foreground">
                Copies the image itself, so a signature editor takes it as a picture rather than as
                visible code.
              </p>
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="outlook">
            <TabsList>
              {CLIENTS.map(client => (
                <TabsTrigger key={client.value} value={client.value}>
                  {client.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {CLIENTS.map(client => (
              <TabsContent key={client.value} value={client.value} className="flex flex-col gap-4">
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                  {client.steps.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="text-sm text-muted-foreground">{client.note}</p>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What this can and cannot tell you</CardTitle>
          <CardDescription>
            Worth reading before anyone treats these numbers as read receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <TriangleAlert />
            <AlertTitle>One pixel in a signature counts opens, not which email was opened</AlertTitle>
            <AlertDescription>
              Every message you send carries the same address, so the views add up into a single
              total. Nothing here says which message, which thread or which recipient a view came
              from. For that you need a different address per email — see below.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">A view is not the same as a person reading</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>
                <span className="text-foreground">Apple Mail Privacy Protection</span> fetches every
                image as mail arrives, whether or not anyone opens it. Apple Mail readers can show
                as opens no one made.
              </li>
              <li>
                <span className="text-foreground">Blocked images</span> are the default in Outlook
                and Gmail for senders the reader has not corresponded with. Those opens are never
                counted at all.
              </li>
              <li>
                <span className="text-foreground">Security scanners</span> at many companies open
                mail before it reaches the person, which counts as a view.
              </li>
              <li>
                <span className="text-foreground">Forwards and replies</span> carry your signature
                with them, so views can arrive from people you never wrote to.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Treat the total as a rough floor on interest, never as proof that a particular person
              read a particular message.
            </p>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Telling one email from another</p>
            <p className="text-sm text-muted-foreground">
              Anything you add to the end of the address is recorded with the view and shows up
              under Queries in the report. Change it per message and each one can be told apart:
            </p>
            <InputGroup className="max-w-xl">
              <InputGroupInput
                value={taggedUrl}
                readOnly
                className="font-mono text-xs"
                aria-label="Pixel URL with a query string"
              />
              <InputGroupAddon align="inline-end">
                <CopyButton value={taggedUrl} label="Copy tagged URL" />
              </InputGroupAddon>
            </InputGroup>
            <p className="text-sm text-muted-foreground">
              A fixed signature cannot do this — you would be editing it before every send. It suits
              a mail-merge tool, or a separate pixel per campaign.
            </p>
          </div>

          <Alert>
            <Info />
            <AlertTitle>Tell people you do this</AlertTitle>
            <AlertDescription>
              Tracking when mail is opened is personal data in the UK, EU and several other places,
              and it is the kind of thing recipients object to when they find out by accident. Make
              sure your privacy notice covers it.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
