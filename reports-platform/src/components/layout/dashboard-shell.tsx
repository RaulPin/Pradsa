'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import type { Role } from '@/types';

const COOKIE = 'pradsa_sidebar_collapsed';

export function DashboardShell({
  email,
  role,
  initialCollapsed,
  children,
}: {
  email: string;
  role: Role;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  // El valor inicial viene del servidor (cookie), así el primer render
  // ya coincide con la preferencia del usuario: sin parpadeo.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try {
        document.cookie = `${COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={role}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          email={email}
          role={role}
          collapsed={collapsed}
          onMenuClick={() => setMobileOpen(true)}
          onToggleCollapse={toggleCollapse}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
