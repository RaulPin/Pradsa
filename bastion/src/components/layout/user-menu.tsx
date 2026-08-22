'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-slate-600 sm:inline">{email}</span>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brass/30"
      >
        <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
      </button>
    </div>
  );
}
