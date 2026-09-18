'use client';
import { VideoOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'rrweb-player/dist/style.css';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getReplayPlayerEvents, getReplayViewport } from '@/lib/replay';

// rrweb-player draws its controller below the replay frame.
const CONTROLLER_HEIGHT = 80;
const MAX_WIDTH = 1100;

type Player = {
  $destroy?: () => void;
  getReplayer?: () => any;
  goto?: (ms: number, play?: boolean) => void;
};

function destroy(player: Player | null) {
  try {
    player?.$destroy?.();
  } catch {
    // The rrweb-player alpha can throw on teardown once its inner replayer is gone.
  }
}

/** Plays back rrweb events, scaled to fit the container while keeping the visitor's aspect ratio. */
export function ReplayPlayer({
  events,
  onReady,
}: {
  events: any[];
  onReady?: (player: Player) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [failed, setFailed] = useState(false);
  const playerEvents = useMemo(() => getReplayPlayerEvents(events), [events]);
  const viewport = useMemo(() => getReplayViewport(playerEvents), [playerEvents]);
  const canPlay = playerEvents.length >= 2 && !failed;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const update = () => setAvailable(element.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // Fit the frame: full width up to MAX_WIDTH, and tall (phone) recordings capped at 70% of the window.
  const ratio = viewport ? viewport.height / viewport.width : 9 / 16;
  let width = Math.min(available || MAX_WIDTH, MAX_WIDTH);
  let height = Math.round(width * ratio);
  const maxHeight = typeof window === 'undefined' ? 700 : Math.round(window.innerHeight * 0.7);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height / ratio);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !canPlay || !available) return;

    let cancelled = false;
    let player: Player | null = null;

    import('rrweb-player')
      .then(({ default: RRWebPlayer }) => {
        if (cancelled) return;

        root.replaceChildren();
        player = new RRWebPlayer({
          target: root,
          props: {
            events: playerEvents,
            width,
            height,
            autoPlay: false,
            showController: true,
            skipInactive: true,
            speedOption: [1, 2, 4, 8],
            showWarning: false,
          },
        }) as Player;
        onReady?.(player);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      destroy(player);
      root.replaceChildren();
    };
    // onReady is a notification only; re-creating the player for a new callback would reset playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, playerEvents, width, height, available]);

  return (
    <div ref={wrapperRef} className="flex w-full justify-center">
      {canPlay ? (
        <div
          ref={rootRef}
          className="replay-player overflow-hidden rounded-lg border bg-muted/30"
          style={{ width, height: height + CONTROLLER_HEIGHT }}
        />
      ) : (
        <Empty className="w-full border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <VideoOff />
            </EmptyMedia>
            <EmptyTitle>Replay unavailable</EmptyTitle>
            <EmptyDescription>
              This recording has no full page snapshot, so it can&apos;t be played back.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
