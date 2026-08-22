import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      {...props}
    />
  );
}

/** Punto de color para severidades/estados. */
export function Dot({ className }: { className?: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', className)} />;
}
