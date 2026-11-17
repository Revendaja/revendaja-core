'use client';

import { useEffect, useState } from 'react';
import { platformUrl } from '@/lib/storefront/domain';
import { hasSeenPrivacyNotice, markPrivacyNoticeSeen } from '@/lib/storefront/privacy';

// Aviso de privacidade da vitrine: a loja guarda carrinho, favoritos, CEP e dados do pedido NESTE
// aparelho (sem conta). Não há cookie de publicidade nem rastreamento, então é um aviso de
// transparência com link para a política, e não um bloqueio. Some ao tocar em "Entendi".
export function PrivacyNotice({ raised = false }: { raised?: boolean }) {
  // Começa escondido: o servidor não sabe se o cliente já viu (evita piscar e HTML diferente).
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!hasSeenPrivacyNotice()), []);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de privacidade"
      className={`fixed inset-x-3 z-40 mx-auto max-w-xl rounded-2xl bg-ink-900 p-4 text-white shadow-[0_12px_32px_rgba(16,24,40,0.35)] sm:bottom-4 sm:left-4 sm:right-auto sm:mx-0 ${
        raised ? 'bottom-20' : 'bottom-3'
      }`}
    >
      <p className="text-[13px] leading-relaxed text-white/90">
        Para agilizar sua compra, esta loja guarda neste aparelho o seu carrinho, favoritos, CEP e os dados do último pedido.
        Não usamos cookies de publicidade nem rastreamos você em outros sites.{' '}
        <a
          href={platformUrl('/privacidade')}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary-300 underline underline-offset-2 hover:text-primary-200"
        >
          Política de privacidade
        </a>
      </p>
      <button
        type="button"
        onClick={() => {
          markPrivacyNoticeSeen();
          setVisible(false);
        }}
        className="mt-3 h-10 rounded-xl bg-primary-500 px-5 text-sm font-semibold text-white transition hover:bg-primary-600"
      >
        Entendi
      </button>
    </div>
  );
}
