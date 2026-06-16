import { getSession } from '@/lib/auth';
import { FolderList } from '@/components/folders/folder-list';

export default function FoldersPage() {
  const session = getSession();
  return <FolderList role={session!.role} />;
}
