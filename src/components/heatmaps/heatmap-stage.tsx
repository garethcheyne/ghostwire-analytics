'use client';
import { Angry, MousePointerBan } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatLongNumber } from '@/lib/format';
import type { ScrollBand } from '@/lib/heatmap';
import { cn } from '@/lib/utils';

export interface FrustrationMarker {
  kind: 'rage' | 'dead';
  pageX: number;
  pageY: number;
  visits: number;
  clicks: number;
}

/** Frame name the tracker and recorder check, so the previewed page isn't counted as a visit. */
export const HEATMAP_FRAME_NAME = 'ghostwire-heatmap';

// Low → high intensity: transparent blue, cyan, green, yellow, red.
const PALETTE_STOPS: [number, string][] = [
  [0.0, 'rgba(0, 0, 255, 0)'],
  [0.2, 'rgb(0, 102, 255)'],
  [0.4, 'rgb(0, 212, 255)'],
  [0.6, 'rgb(0, 230, 118)'],
  [0.8, 'rgb(255, 235, 59)'],
  [1.0, 'rgb(255, 23, 68)'],
];

function createPalette() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  PALETTE_STOPS.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

/**
 * Classic heatmap rendering: stamp a soft alpha brush for every click (weighted by its count),
 * then map the accumulated alpha of each pixel onto a colour palette.
 */
function drawHeat(
  canvas: HTMLCanvasElement,
  points: { pageX: number; pageY: number; count: number }[],
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !points.length) return;

  const radius = Math.max(18, Math.round(width * 0.02));
  const brush = document.createElement('canvas');
  brush.width = brush.height = radius * 2;
  const brushCtx = brush.getContext('2d')!;
  const gradient = brushCtx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  brushCtx.fillStyle = gradient;
  brushCtx.fillRect(0, 0, radius * 2, radius * 2);

  const maxCount = Math.max(...points.map(point => point.count));

  for (const point of points) {
    ctx.globalAlpha = Math.min(1, 0.2 + 0.8 * (point.count / maxCount));
    ctx.drawImage(brush, point.pageX - radius, point.pageY - radius);
  }

  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const palette = createPalette();

  for (let i = 3; i < pixels.length; i += 4) {
    const alpha = pixels[i];
    if (!alpha) continue;

    const offset = alpha * 4;
    pixels[i - 3] = palette[offset];
    pixels[i - 2] = palette[offset + 1];
    pixels[i - 1] = palette[offset + 2];
    pixels[i] = Math.min(255, 60 + alpha);
  }

  ctx.putImageData(image, 0, 0);
}

function ClickLayer({
  points,
  width,
  height,
}: {
  points: { pageX: number; pageY: number; count: number }[];
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawHeat(canvasRef.current, points, width, height);
  }, [points, width, height]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 opacity-80" />;
}

function ScrollLayer({ bands, scale }: { bands: ScrollBand[]; scale: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {bands.map(band => {
        // Red where everyone got to, through yellow, to faint where few did.
        const hue = Math.round(band.ratio * 60);

        return (
          <div
            key={band.fromPct}
            className="absolute inset-x-0 border-t border-white/30"
            style={{
              top: `${band.fromPct}%`,
              height: `${band.toPct - band.fromPct}%`,
              background: `hsla(${60 - hue}, 95%, 55%, ${0.06 + band.ratio * 0.26})`,
            }}
          >
            {/* Sits on the band's lower edge: the share of visits that scrolled past that line. */}
            <span
              className="absolute right-1 bottom-1 origin-bottom-right rounded bg-black/75 px-2 py-0.5 text-xs whitespace-nowrap text-white tabular-nums"
              style={{ transform: `scale(${1 / scale})` }}
              title={`${formatLongNumber(band.reached)} visits`}
            >
              {band.toPct}% down: {Math.round(band.ratio * 100)}% of visits
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MarkerLayer({ markers, scale }: { markers: FrustrationMarker[]; scale: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {markers.map(marker => {
        const Icon = marker.kind === 'rage' ? Angry : MousePointerBan;
        // Fixed colours, not theme tokens: markers sit on the visitor's page, which doesn't follow our theme.
        const visits = `${marker.visits} ${marker.visits === 1 ? 'visit' : 'visits'}`;

        return (
          <Tooltip key={`${marker.kind}:${marker.pageX}:${marker.pageY}`}>
            <TooltipTrigger asChild>
              {/* Counter-scaled so markers stay a readable size however far the page is zoomed out. */}
              <span
                className={cn(
                  'pointer-events-auto absolute flex size-7 items-center justify-center rounded-full shadow-md ring-2 ring-white',
                  marker.kind === 'rage' ? 'bg-red-600 text-white' : 'bg-zinc-900/90 text-white',
                )}
                style={{
                  left: marker.pageX,
                  top: marker.pageY,
                  transform: `translate(-50%, -50%) scale(${1 / scale})`,
                }}
              >
                <Icon className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {marker.kind === 'rage'
                ? `Rage clicks: ${visits}, up to ${marker.clicks} clicks in a second`
                : `Dead clicks: ${marker.clicks} with no response, ${visits}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * The page rendered at the chosen screen width, scaled down to fit, with the heat overlay on top.
 * The live page loads in a named iframe; if it can't be framed, the overlay still shows.
 */
export function HeatmapStage({
  url,
  width,
  height,
  points,
  bands,
  markers,
}: {
  url: string | null;
  width: number;
  height: number;
  points?: { pageX: number; pageY: number; count: number }[];
  bands?: ScrollBand[];
  markers?: FrustrationMarker[];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  // The overlay waits for the current frame (page + width) to load.
  const frameKey = `${url}:${width}`;
  const [loadedFrame, setLoadedFrame] = useState<string | null>(null);
  const loaded = !url || loadedFrame === frameKey;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const update = () => setAvailable(element.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Some sites never fire load inside a frame; show the overlay after a moment regardless.
    const timer = window.setTimeout(() => setLoadedFrame(frameKey), 2500);
    return () => window.clearTimeout(timer);
  }, [frameKey]);

  const scale = available ? Math.min(1, available / width) : 0;

  return (
    <div ref={wrapperRef} className="w-full">
      {scale > 0 && (
        <div
          className="relative mx-auto overflow-hidden rounded-lg border bg-muted/40"
          style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width, height, transform: `scale(${scale})` }}
          >
            {url && (
              <iframe
                key={frameKey}
                name={HEATMAP_FRAME_NAME}
                src={url}
                title="Page preview"
                tabIndex={-1}
                scrolling="no"
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute inset-0 border-0 bg-white"
                style={{ width, height }}
                onLoad={() => setLoadedFrame(frameKey)}
              />
            )}
            {loaded ? (
              <>
                {points && <ClickLayer points={points} width={width} height={height} />}
                {bands && <ScrollLayer bands={bands} scale={scale} />}
                {markers && <MarkerLayer markers={markers} scale={scale} />}
              </>
            ) : (
              <Skeleton className="absolute inset-0 rounded-none" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
