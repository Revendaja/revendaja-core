'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { GOOGLE_CLIENT_ID } from '@/lib/api/config';
import { useAuth } from '@/lib/auth/AuthContext';
import { getErrorMessage } from '@/lib/api/errors';

// Tipagem mínima do Google Identity Services (não há @types oficial) — só o que usamos aqui.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill';
              logo_alignment?: 'left' | 'center';
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

const GSI_MAX_WIDTH = 400;

// Botão oficial do Google (via Identity Services): clicar abre o fluxo de login do Google e
// devolve um ID token no `callback`, que trocamos pela sessão da Revendaja em POST /auth/google.
// Some silenciosamente se NEXT_PUBLIC_GOOGLE_CLIENT_ID não estiver configurado (mesmo padrão do
// backend: a feature degrada sem derrubar o resto da tela).
export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const { loginWithGoogle } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_CLIENT_ID) return;
    const container = containerRef.current;
    const google = window.google;
    if (!container || !google) return;

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        void loginWithGoogle(response.credential).catch((error) => onError(getErrorMessage(error)));
      },
    });

    google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(container.offsetWidth || GSI_MAX_WIDTH, GSI_MAX_WIDTH),
    });
  }, [scriptLoaded, loginWithGoogle, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} />
      <div ref={containerRef} className="flex w-full justify-center" />
    </>
  );
}
