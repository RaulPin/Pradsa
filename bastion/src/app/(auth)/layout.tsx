export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center">
            <svg viewBox="0 0 40 44" className="h-14 w-14" aria-hidden="true">
              <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#e0b04a" />
                  <stop offset="1" stopColor="#9a6f18" />
                </linearGradient>
              </defs>
              <path d="M20 1 L38 8 V22 C38 33 30 40 20 43 C10 40 2 33 2 22 V8 Z" fill="none" stroke="url(#bg)" strokeWidth="2" />
              <path d="M11 17 L20 13 L29 17" fill="none" stroke="url(#bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 24 L20 20 L29 24" fill="none" stroke="url(#bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 31 L20 27 L29 31" fill="none" stroke="url(#bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-semibold text-white">Bastión</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.26em] text-brass-light">SGSI · ISO/IEC 27001</p>
        </div>
        {children}
      </div>
    </div>
  );
}
