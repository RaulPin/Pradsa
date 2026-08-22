'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import type { Membership } from '@/types';
import { ROLE_LABELS } from '@/types';

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '·';
}

export function OrgSwitcher({ activeOrgId, activeName, roleLabel }: { activeOrgId: string; activeName: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || memberships.length) return;
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMemberships(d.memberships || []))
      .catch(() => {});
  }, [open, memberships.length]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function switchTo(orgId: string) {
    if (orgId === activeOrgId) { setOpen(false); return; }
    setSwitching(true);
    const res = await fetch('/api/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    setSwitching(false);
    setOpen(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brass/30"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brass-light to-brass-dark font-display text-sm font-bold text-white">
          {initials(activeName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-slate-900">{activeName}</span>
          <span className="block text-[11px] leading-tight text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="flex items-center gap-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <Building2 className="h-3.5 w-3.5" /> Organizaciones
          </p>
          {memberships.length === 0 && <p className="px-2.5 py-2 text-sm text-slate-400">Cargando…</p>}
          {memberships.map((m) => (
            <button
              key={m.org_id}
              onClick={() => switchTo(m.org_id)}
              disabled={switching}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-gradient-to-br from-brass-light to-brass-dark font-display text-sm font-bold text-white">
                {initials(m.org_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{m.org_name}</span>
                <span className="block text-[11px] text-slate-500">{ROLE_LABELS[m.role]}</span>
              </span>
              {m.org_id === activeOrgId && <Check className="h-4 w-4 text-brass" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
