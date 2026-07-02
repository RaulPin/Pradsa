'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderClosed,
  Upload,
  Users,
  ScrollText,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'CLIENT_FULL'] },
  { href: '/folders', label: 'Carpetas', icon: FolderClosed, roles: ['SUPER_ADMIN', 'UPLOADER', 'CLIENT_FULL', 'CLIENT_BANCA', 'CLIENT_FOLDER'] },
  { href: '/upload', label: 'Cargar reportes', icon: Upload, roles: ['SUPER_ADMIN', 'UPLOADER'] },
  { href: '/users', label: 'Usuarios', icon: Users, roles: ['SUPER_ADMIN'] },
  { href: '/audit', label: 'Auditoría', icon: ScrollText, roles: ['SUPER_ADMIN'] },
];

export function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  role: Role;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.roles.includes(role));

  return (
    <>
      {/* Backdrop (solo móvil) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onCloseMobile} aria-hidden />
      )}

      <aside
        className={cn(
          'z-40 flex h-screen flex-col bg-sidebar text-slate-300 transition-all duration-200',
          'fixed inset-y-0 left-0 lg:static',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-64 lg:w-20' : 'w-64'
        )}
      >
        {/* Marca + cierre móvil */}
        <div
          className={cn(
            'flex items-center gap-3 border-b border-white/10 px-4 py-5 text-white',
            collapsed && 'lg:justify-center lg:px-0'
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/30">
            <ShieldCheck className="text-white" size={20} />
          </span>
          <span className={cn('text-lg font-semibold tracking-wide', collapsed && 'lg:hidden')}>Pradsa</span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  collapsed && 'lg:justify-center lg:px-0',
                  active
                    ? 'bg-sidebarHover text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-gold'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <form action="/api/auth/logout" method="post" className="border-t border-white/10 p-3">
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white',
              collapsed && 'lg:justify-center lg:px-0'
            )}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>Cerrar sesión</span>
          </button>
        </form>
      </aside>
    </>
  );
}
