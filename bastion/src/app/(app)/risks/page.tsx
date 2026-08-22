import { getSession } from '@/lib/auth';
import { canEdit } from '@/lib/session';
import { RisksManager } from '@/components/risks/risks-manager';

export default function RisksPage() {
  const session = getSession()!;
  return <RisksManager editable={canEdit(session.role)} />;
}
