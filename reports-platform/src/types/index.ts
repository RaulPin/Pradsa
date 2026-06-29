export type Role = 'SUPER_ADMIN' | 'UPLOADER' | 'CLIENT_FULL' | 'CLIENT_BANCA' | 'CLIENT_FOLDER';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'DOWNLOAD'
  | 'UPLOAD'
  | 'OTP_REQUESTED'
  | 'OTP_VERIFIED'
  | 'PASSWORD_CHANGED'
  | 'USER_CREATED'
  | 'FOLDER_CREATED';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Banca {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  description: string | null;
  region_code: string | null;
  banca_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FolderWithStats extends Folder {
  banca_name: string | null;
  report_count: number;
  last_upload: string | null;
  download_count: number;
}

export interface Report {
  id: string;
  folder_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  is_active: boolean;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  email: string | null;
  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
  exp: number;
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Administrador',
  UPLOADER: 'Cargador',
  CLIENT_FULL: 'Cliente (acceso total)',
  CLIENT_BANCA: 'Administrativo de Banca',
  CLIENT_FOLDER: 'Cliente (carpeta)',
};
