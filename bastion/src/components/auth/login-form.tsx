'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar sesión');
        return;
      }
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-white p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Iniciar sesión</h2>
      <p className="mb-5 text-sm text-slate-500">Recibirás un código de verificación en tu correo.</p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
        </div>
        <div>
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
        {loading ? 'Enviando código…' : 'Continuar'}
      </Button>
    </form>
  );
}
