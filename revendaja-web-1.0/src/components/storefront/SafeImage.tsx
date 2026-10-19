'use client';

import { useState } from 'react';

// Imagem que não deixa o ícone de "imagem quebrada" aparecer: se a foto não carrega (link velho,
// arquivo apagado), mostra `fallback` (ou nada). Volta a tentar se o endereço mudar.
export function SafeImage({
  src,
  alt = '',
  className,
  fallback = null,
  loading = 'lazy',
}: {
  src: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  loading?: 'lazy' | 'eager';
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading={loading} className={className} onError={() => setFailedSrc(src)} />
  );
}
