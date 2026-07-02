'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Download } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { AuditLog } from '@/types';

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Acceso fallido',
  DOWNLOAD: 'Descarga',
  UPLOAD: 'Carga',
  OTP_REQUESTED: 'OTP solicitado',
  OTP_VERIFIED: 'OTP verificado',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET: 'Reseteo de contraseña',
  USER_CREATED: 'Usuario creado',
  FOLDER_CREATED: 'Carpeta creada',
  FOLDER_DELETED: 'Carpeta eliminada',
};

const ACTION_TONE: Record<string, 'green' | 'red' | 'blue' | 'amber' | 'slate'> = {
  LOGIN: 'green', DOWNLOAD: 'blue', UPLOAD: 'amber', LOGIN_FAILED: 'red', PASSWORD_RESET: 'amber',
};

export function AuditViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', email: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.action) params.set('action', filters.action);
    if (filters.email) params.set('email', filters.email);
    if (filters.from) params.set('from', new Date(filters.from).toISOString());
    if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59').toISOString());
    const res = await fetch(`/api/audit?${params.toString()}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    const headers = ['Fecha', 'Usuario', 'Acción', 'Recurso', 'IP'];
    const rows = logs.map((l) => [
      format(new Date(l.created_at), 'yyyy-MM-dd HH:mm:ss'),
      l.email || '',
      ACTION_LABELS[l.action] || l.action,
      l.resource_type || '',
      l.ip_address || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">Trazabilidad</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">Auditoría</h1>
          <p className="text-sm text-slate-500">Registro de logins, descargas y cargas</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!logs.length}>
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-4">
          <div>
            <Label>Acción</Label>
            <Select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div><Label>Usuario</Label><Input placeholder="correo…" value={filters.email} onChange={(e) => setFilters({ ...filters, email: e.target.value })} /></div>
          <div><Label>Desde</Label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><Label>Hasta</Label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <Table>
            <THead>
              <TR><TH>Fecha y hora</TH><TH>Usuario</TH><TH>Acción</TH><TH>Recurso</TH><TH>IP</TH></TR>
            </THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{format(new Date(l.created_at), "d MMM yyyy, HH:mm:ss", { locale: es })}</TD>
                  <TD>{l.email || '—'}</TD>
                  <TD><Badge tone={ACTION_TONE[l.action] || 'slate'}>{ACTION_LABELS[l.action] || l.action}</Badge></TD>
                  <TD>{l.resource_type || '—'}</TD>
                  <TD className="text-xs text-slate-500">{l.ip_address || '—'}</TD>
                </TR>
              ))}
              {logs.length === 0 && (
                <TR><TD className="py-10 text-center text-slate-400" colSpan={5}>Sin registros para los filtros seleccionados.</TD></TR>
              )}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
