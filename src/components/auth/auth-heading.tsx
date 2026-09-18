import Image from 'next/image';

export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 lg:hidden">
        <Image
          src="/logo.png"
          alt="Ghostwire"
          width={80}
          height={80}
          className="size-20 object-contain"
        />
        <div className="text-center">
          <span className="text-2xl font-bold">Ghostwire</span>
          <p className="mt-1 text-xs tracking-widest text-muted-foreground uppercase">Analytics</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Only follow same-origin relative redirects after login. */
export function safeNext(next?: string) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/websites';
}
