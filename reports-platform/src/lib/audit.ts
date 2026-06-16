import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { AuditAction } from '@/types';

interface AuditParams {
  userId?: string | null;
  email?: string | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  req?: NextRequest;
}

export function getClientIp(req?: NextRequest): string | null {
  if (!req) return null;
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  );
}

export async function logAudit(params: AuditParams): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('audit_logs').insert({
    user_id: params.userId ?? null,
    email: params.email ?? null,
    action: params.action,
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    ip_address: getClientIp(params.req),
    user_agent: params.req?.headers.get('user-agent') ?? null,
  });
}
