'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Boxes, ShieldAlert, ListChecks, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgRole } from '@/types';

const NAV = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard, group: 'Gestión' },
  { href: '/assets', label: 'Activos', icon: Boxes, group: 'Gestión' },
  { href: '/risks', label: 'Riesgos', icon: ShieldAlert, group: 'Gestión' },
  { href: '/soa', label: 'Controles (SoA)', icon: ListChecks, group: 'Cumplimiento' },
  { href: '/audit', label: 'Bitácora', icon: ScrollText, group: 'Cumplimiento' },
];

export function Sidebar({ role }: { role: OrgRole }) {
  const pathname = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-ink-line bg-ink px-3 py-5 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <svg viewBox="0 0 40 44" className="h-7 w-7" aria-hidden="true">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e0b04a" />
              <stop offset="1" stopColor="#9a6f18" />
            </linearGradient>
          </defs>
          <path d="M20 1 L38 8 V22 C38 33 30 40 20 43 C10 40 2 33 2 22 V8 Z" fill="none" stroke="url(#sg)" strokeWidth="2.5" />
          <path d="M11 18 L20 14 L29 18 M11 26 L20 22 L29 26" fill="none" stroke="url(#sg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-display text-xl font-semibold text-white">Bastión</span>
      </div>

      <nav className="flex-1 space-y-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted/70">{group}</p>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === group).map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      active ? 'bg-brass/15 font-medium text-white' : 'text-ink-muted hover:bg-ink-soft hover:text-white'
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <p className="px-2 pt-4 font-mono text-[10px] text-ink-muted/60">ISO/IEC 27001:2022</p>
    </aside>
  );
}
