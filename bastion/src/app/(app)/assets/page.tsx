import { getSession } from '@/lib/auth';
import { canEdit } from '@/lib/session';
import { AssetsManager } from '@/components/assets/assets-manager';

export default function AssetsPage() {
  const session = getSession()!;
  return <AssetsManager editable={canEdit(session.role)} />;
}
