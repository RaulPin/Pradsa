import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bastión · SGSI ISO 27001',
  description: 'Plataforma multiempresa para gestionar un Sistema de Gestión de Seguridad de la Información conforme a ISO/IEC 27001:2022.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
