import { getSession } from '@/lib/auth';
import { canEdit } from '@/lib/session';
import { SoaManager } from '@/components/soa/soa-manager';

export default function SoaPage() {
  const session = getSession()!;
  return <SoaManager editable={canEdit(session.role)} />;
}
