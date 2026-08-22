'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function OtpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código incorrecto');
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
    <form onSubmit={onSubmit} className="rounded-xl bg-white p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Verifica tu identidad</h2>
      <p className="mb-5 text-sm text-slate-500">
        Escribe el código de 6 dígitos que enviamos a <span className="font-medium text-slate-700">{email || 'tu correo'}</span>.
      </p>

      <Label htmlFor="code">Código de verificación</Label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className="text-center text-2xl tracking-[0.5em] tnum"
      />

      {error && <p className="mt-4 rounded-lg bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit">{error}</p>}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading || code.length < 6}>
        {loading ? 'Verificando…' : 'Entrar'}
      </Button>
      <button type="button" onClick={() => router.push('/login')} className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-700">
        Volver
      </button>
    </form>
  );
}
