import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { OrgSwitcher } from '@/components/layout/org-switcher';
import { UserMenu } from '@/components/layout/user-menu';
import { ROLE_LABELS } from '@/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/login');

  const supabase = createServiceClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', session.orgId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
          <OrgSwitcher
            activeOrgId={session.orgId}
            activeName={org?.name || session.orgSlug}
            roleLabel={ROLE_LABELS[session.role]}
          />
          <UserMenu email={session.email} />
        </header>
        <main className="flex-1 p-5 sm:p-7">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
