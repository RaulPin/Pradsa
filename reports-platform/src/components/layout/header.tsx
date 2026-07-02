'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@/types';

export function Header({
  email,
  role,
  collapsed,
  onMenuClick,
  onToggleCollapse,
}: {
  email: string;
  role: Role;
  collapsed: boolean;
  onMenuClick: () => void;
  onToggleCollapse: () => void;
}) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-1">
        {/* Hamburguesa (móvil) */}
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
        {/* Colapsar/expandir (escritorio) */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:inline-flex"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden min-w-0 text-right leading-tight sm:block">
          <p className="truncate text-sm font-medium text-slate-900">{email}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ROLE_LABELS[role]}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-sm font-semibold text-white">
          {initials}
        </div>
      </div>
    </header>
  );
}
