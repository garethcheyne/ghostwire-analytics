import Image from 'next/image';

const terminalLines = [
  { command: 'track', target: 'pageview /pricing', status: '200', tone: 'text-green-400' },
  { command: 'track', target: 'event signup-click', status: '200', tone: 'text-green-400' },
  { command: 'record', target: 'session replay chunk', status: '202', tone: 'text-green-400' },
  { command: 'heatmap', target: 'click .hero-cta', status: '200', tone: 'text-green-400' },
  { command: 'filter', target: 'bot user-agent', status: 'DROP', tone: 'text-yellow-400' },
  { command: 'geo', target: 'lookup 203.0.113.7', status: 'NZ', tone: 'text-cyan-400' },
];

// Branded split-screen layout, matching the ghostwire-proxy login.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#050a0f] p-12 lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(0,220,180,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-violet-500/8 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-scanline absolute right-0 left-0 h-px bg-linear-to-r from-transparent via-cyan-400/40 to-transparent" />
        </div>
        <div className="absolute top-0 right-0 left-0 h-px bg-linear-to-r from-transparent via-cyan-500/50 to-transparent" />
        <div className="absolute right-0 bottom-0 left-0 h-px bg-linear-to-r from-transparent via-violet-500/30 to-transparent" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 scale-150 animate-pulse rounded-full bg-cyan-400/20 blur-lg" />
            <Image
              src="/logo.png"
              alt="Ghostwire"
              width={40}
              height={40}
              className="relative size-10 object-contain brightness-0 invert"
            />
          </div>
          <div>
            <span className="text-xl font-bold tracking-widest text-white uppercase">Ghostwire</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
              <span className="font-mono text-[10px] tracking-widest text-green-400/80 uppercase">
                Analytics Online
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-10">
          <div>
            <div className="mb-5 flex items-center gap-2">
              <div className="h-px w-6 bg-cyan-400/60" />
              <span className="font-mono text-[10px] tracking-[0.25em] text-cyan-400/70 uppercase">
                Privacy-first Web Analytics
              </span>
            </div>
            <h1 className="mb-5 text-5xl leading-[1.1] font-black tracking-tight text-white">
              Know your
              <br />
              <span className="bg-linear-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
                visitors
              </span>
              <br />
              <span className="text-3xl font-light text-white/50">without tracking them.</span>
            </h1>
            <p className="max-w-sm font-mono text-sm leading-relaxed text-white/35">
              Pageviews. Events. Funnels. Heatmaps. Session replay. Self-hosted, cookie-free.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/5 bg-white/[0.02] font-mono text-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
              <div className="size-2.5 rounded-full bg-red-500/60" />
              <div className="size-2.5 rounded-full bg-yellow-500/60" />
              <div className="size-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 text-[10px] tracking-widest text-white/20">
                ghostwire-analytics — collect
              </span>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {terminalLines.map(({ command, target, status, tone }, index) => (
                <div
                  key={target}
                  className="animate-float-up flex items-center gap-3 opacity-0"
                  style={{ animationDelay: `${(index + 1) * 0.1}s` }}
                >
                  <span className="text-white/20 select-none">$</span>
                  <span className="text-cyan-400/60">{command}</span>
                  <span className="flex-1 truncate text-white/40">{target}</span>
                  <span className={`flex items-center gap-1.5 text-xs ${tone}`}>
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    {status}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 text-xs text-white/20">
                <span>▸</span>
                <span className="animate-cursor-blink">_</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/5">
            <div className="border-r border-white/5 bg-white/[0.02] px-5 py-4 text-center">
              <div className="font-mono text-2xl font-black tracking-tight text-cyan-400">0</div>
              <div className="mt-1 font-mono text-[10px] tracking-widest text-white/25 uppercase">
                Cookies
              </div>
            </div>
            <div className="border-r border-white/5 bg-white/[0.02] px-5 py-4 text-center">
              <div className="font-mono text-2xl font-black tracking-tight text-violet-400">100%</div>
              <div className="mt-1 font-mono text-[10px] tracking-widest text-white/25 uppercase">
                Your Data
              </div>
            </div>
            <div className="bg-white/[0.02] px-5 py-4 text-center">
              <div className="font-mono text-2xl font-black tracking-tight text-green-400">GDPR</div>
              <div className="mt-1 font-mono text-[10px] tracking-widest text-white/25 uppercase">
                Friendly
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 font-mono text-[10px] tracking-[0.3em] text-white/15 uppercase">
          {'// Collect. Analyse. Respect.'}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
