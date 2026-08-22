import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { OrgRole, SessionPayload } from '@/types';

/**
 * Guardas para route handlers. Devuelven la sesión o una respuesta 401/403.
 * Toda consulta a datos debe filtrarse por `session.orgId`.
 */
export type Guard = { session: SessionPayload } | { error: NextResponse };

export function requireSession(): Guard {
  const session = getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  return { session };
}

const CAN_EDIT: OrgRole[] = ['OWNER', 'MANAGER'];

export function requireEditor(): Guard {
  const guard = requireSession();
  if ('error' in guard) return guard;
  if (!CAN_EDIT.includes(guard.session.role)) {
    return { error: NextResponse.json({ error: 'No tienes permisos para esta acción' }, { status: 403 }) };
  }
  return guard;
}

export function canEdit(role: OrgRole): boolean {
  return CAN_EDIT.includes(role);
}
