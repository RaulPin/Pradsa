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
  { href: '/folders', label: 'Carpetas', icon: FolderClosed, roles: ['SUPER_ADMIN', 'UPLOADER', 'CLIENT_FULL', 'CLIENT_FOLDER'] },
  { href: '/upload', label: 'Cargar reportes', icon: Upload, roles: ['SUPER_ADMIN', 'UPLOADER'] },
  { href: '/users', label: 'Usuarios', icon: Users, roles: ['SUPER_ADMIN'] },
  { href: '/audit', label: 'Auditoría', icon: ScrollText, roles: ['SUPER_ADMIN'] },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.roles.includes(role));

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-slate-300">
      <div className="flex items-center gap-2 px-6 py-5 text-white">
        <ShieldCheck className="text-primary-light" size={26} />
        <span className="text-lg font-semibold">Reportes</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-white' : 'hover:bg-sidebarHover hover:text-white'
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="border-t border-slate-700 p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-sidebarHover hover:text-white"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
