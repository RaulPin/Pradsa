'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadZone } from './upload-zone';

// Carga de reportes directamente dentro de una carpeta (para admin/cargador).
export function FolderUploadPanel({ folderId, folderName }: { folderId: string; folderName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload size={16} /> Cargar reportes aquí
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Cargar en esta carpeta</p>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar carga"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          <X size={18} />
        </button>
      </div>
      <UploadZone
        lockedFolderId={folderId}
        lockedFolderName={folderName}
        onUploaded={() => router.refresh()}
      />
    </div>
  );
}
