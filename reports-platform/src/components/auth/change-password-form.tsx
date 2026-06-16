'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    if (!/[A-Z]/.test(password)) return 'Debe incluir al menos una mayúscula.';
    if (!/[a-z]/.test(password)) return 'Debe incluir al menos una minúscula.';
    if (!/[0-9]/.test(password)) return 'Debe incluir al menos un número.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Debe incluir al menos un símbolo.';
    if (password !== confirm) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo actualizar la contraseña');
        return;
      }
      router.push(data.redirect || '/dashboard');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-slate-600">
            Por seguridad debes establecer una nueva contraseña en tu primer ingreso.
          </p>
          <div>
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input id="password" type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <Label htmlFor="confirm">Confirmar contraseña</Label>
            <Input id="confirm" type="password" required value={confirm}
              onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
          </div>
          <ul className="text-xs text-slate-500 space-y-0.5">
            <li>• Mínimo 10 caracteres</li>
            <li>• Mayúsculas, minúsculas, número y símbolo</li>
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" size={16} />}
            Guardar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
