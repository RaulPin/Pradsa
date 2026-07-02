import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/30">
            <ShieldCheck className="text-white" size={30} />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-white">Pradsa</h1>
          <p className="mt-1 text-sm text-slate-400">Plataforma de reportes · Acceso privado</p>
        </div>
        {children}
      </div>
    </div>
  );
}
