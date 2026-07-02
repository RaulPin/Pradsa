import { UploadZone } from '@/components/reports/upload-zone';

export default function UploadPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow">Documentos</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">Cargar reportes</h1>
        <p className="text-sm text-slate-500">Selecciona la carpeta de destino y sube uno o varios PDF.</p>
      </div>
      <UploadZone />
    </div>
  );
}
