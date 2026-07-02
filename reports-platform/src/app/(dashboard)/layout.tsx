import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { DashboardShell } from '@/components/layout/dashboard-shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/login');

  // Estado del sidebar leído en el servidor (evita el parpadeo al recargar).
  const initialCollapsed = cookies().get('pradsa_sidebar_collapsed')?.value === '1';

  return (
    <DashboardShell email={session.email} role={session.role} initialCollapsed={initialCollapsed}>
      {children}
    </DashboardShell>
  );
}
