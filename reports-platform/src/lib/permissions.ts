import { createServiceClient } from '@/lib/supabase/server';
import type { Role } from '@/types';

/** Devuelve los IDs de carpeta visibles para el usuario, o null si ve todas. */
export async function allowedFolderIds(userId: string, role: Role): Promise<string[] | null> {
  if (role === 'SUPER_ADMIN' || role === 'UPLOADER' || role === 'CLIENT_FULL') {
    return null; // null = todas
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('user_folder_permissions')
    .select('folder_id')
    .eq('user_id', userId);
  return (data || []).map((r) => r.folder_id);
}

export async function canAccessFolder(userId: string, role: Role, folderId: string): Promise<boolean> {
  const ids = await allowedFolderIds(userId, role);
  if (ids === null) return true;
  return ids.includes(folderId);
}
