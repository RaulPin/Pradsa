import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-sidebar">
            <ShieldCheck className="text-primary-light" size={30} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Plataforma de Reportes</h1>
          <p className="text-sm text-slate-500">Acceso privado y seguro</p>
        </div>
        {children}
      </div>
    </div>
  );
}
