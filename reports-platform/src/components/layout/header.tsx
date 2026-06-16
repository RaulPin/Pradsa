import { ROLE_LABELS, type Role } from '@/types';

export function Header({ email, role }: { email: string; role: Role }) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <header className="flex h-16 items-center justify-end border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">{email}</p>
          <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          {initials}
        </div>
      </div>
    </header>
  );
}
