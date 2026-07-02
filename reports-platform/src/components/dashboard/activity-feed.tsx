import { LogIn, Download, Upload, KeyRound, UserPlus, FolderPlus, Activity, CircleCheck, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AuditLog } from '@/types';

const ICONS: Record<string, React.ElementType> = {
  LOGIN: LogIn,
  DOWNLOAD: Download,
  UPLOAD: Upload,
  PASSWORD_CHANGED: KeyRound,
  PASSWORD_RESET: KeyRound,
  USER_CREATED: UserPlus,
  FOLDER_CREATED: FolderPlus,
  REPORT_RECEIVED: CircleCheck,
  REPORT_DELETED: Trash2,
  USER_DELETED: Trash2,
  FOLDER_DELETED: Trash2,
};

const LABELS: Record<string, string> = {
  LOGIN: 'inició sesión',
  LOGOUT: 'cerró sesión',
  DOWNLOAD: 'descargó un reporte',
  UPLOAD: 'cargó un reporte',
  PASSWORD_CHANGED: 'cambió su contraseña',
  USER_CREATED: 'creó un usuario',
  FOLDER_CREATED: 'creó carpetas',
  OTP_REQUESTED: 'solicitó un código',
  OTP_VERIFIED: 'verificó su código',
  LOGIN_FAILED: 'intento fallido de acceso',
  PASSWORD_RESET: 'reseteó una contraseña',
  USER_DELETED: 'eliminó un usuario',
  FOLDER_DELETED: 'eliminó carpetas',
  REPORT_RECEIVED: 'confirmó la recepción de un reporte',
  REPORT_DELETED: 'eliminó un reporte',
};

export function ActivityFeed({ logs }: { logs: AuditLog[] }) {
  if (!logs.length) {
    return <p className="py-8 text-center text-sm text-slate-400">Sin actividad reciente.</p>;
  }
  return (
    <ul className="space-y-3">
      {logs.map((log) => {
        const Icon = ICONS[log.action] || Activity;
        return (
          <li key={log.id} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">{log.email || 'Sistema'}</span>{' '}
                {LABELS[log.action] || log.action}
              </p>
              <p className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
