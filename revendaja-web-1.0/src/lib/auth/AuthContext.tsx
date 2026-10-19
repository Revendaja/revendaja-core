'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth';
import { refreshAccessToken, setSessionEndedHandler } from '../api/http';
import { getErrorMessage, isApiError } from '../api/errors';
import type { AuthResponse, AuthUser, LoginInput, MeResponse, RegisterInput, StoreInfo } from '../api/types';
import { tokenStorage } from './tokenStorage';

// loading: abrindo o app e consultando a sessão · bootError: falhou sem ser 401 (rede, 5xx) — dá para tentar de novo.
type AuthStatus = 'loading' | 'bootError' | 'signedOut' | 'signedIn';

export type AuthNotice = { type: 'error' | 'success'; message: string };

type Session = {
  user: AuthUser;
  isVerified: boolean;
  store: StoreInfo | null;
};

export const OTP_RESEND_COOLDOWN_SECONDS = 30;

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  isVerified: boolean;
  store: StoreInfo | null;
  bootError: string | null;
  notice: AuthNotice | null;
  // Quando o último código OTP foi enviado (base do contador de reenvio). null = desconhecido, reenvio liberado.
  otpSentAt: number | null;

  clearNotice: () => void;
  retryBootstrap: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  // Troca um ID token do Google (já obtido no navegador) pela sessão da Revendaja — cria a conta
  // na primeira vez.
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  // Ajusta o contador de reenvio (ex.: o servidor disse "aguarde 12s" → cooldown restante de 12s).
  setOtpCooldownRemaining: (seconds: number) => void;
  applyStore: (store: StoreInfo) => void;
  applyUser: (user: AuthUser) => void;
  markUnverified: () => void;
  // A API disse que a conta não tem loja (404/403): volta para a tela de criar loja.
  clearStore: () => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  // Volta ao login (apagando qualquer sessão local) exibindo um aviso — ex.: senha redefinida.
  returnToLogin: (notice?: AuthNotice) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSessionState] = useState<Session | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);

  // Logout voluntário não deve mostrar o aviso de "sessão encerrada".
  const loggingOut = useRef(false);

  const setSession = useCallback((next: Session | null) => {
    setSessionState(next);
  }, []);

  const signOutLocal = useCallback(
    (nextNotice: AuthNotice | null) => {
      setSession(null);
      setOtpSentAt(null);
      setBootError(null);
      setNotice(nextNotice);
      setStatus('signedOut');
    },
    [setSession]
  );

  const applyMe = useCallback(
    (me: MeResponse) => {
      setSession({ user: me.user, isVerified: me.isVerified, store: me.store });
      setBootError(null);
      setStatus('signedIn');
    },
    [setSession]
  );

  // O cliente HTTP avisa aqui quando a sessão acabou (refresh vencido, login em outro aparelho...).
  useEffect(() => {
    setSessionEndedHandler((message) => {
      if (loggingOut.current) return;
      signOutLocal({ type: 'error', message });
    });
    return () => setSessionEndedHandler(null);
  }, [signOutLocal]);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    setBootError(null);

    // Só o refreshToken sobrevive a um F5 (ver tokenStorage.ts): sem ele, não há sessão para retomar.
    const refreshToken = tokenStorage.bootFromStorage();
    if (!refreshToken) {
      setStatus('signedOut');
      return;
    }

    try {
      await refreshAccessToken();
      applyMe(await authApi.getMe());
    } catch (error) {
      // 401: o cliente HTTP já encerrou a sessão e levou o usuário ao login com a mensagem da API.
      if (isApiError(error) && error.status === 401) {
        setStatus((current) => (current === 'loading' ? 'signedOut' : current));
        return;
      }
      // Sem rede/servidor fora: não desloga, deixa tentar de novo.
      setBootError(getErrorMessage(error));
      setStatus('bootError');
    }
  }, [applyMe]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // login/register não devolvem a loja (só hasStore): busca em /me para ter handle, link etc.
  const establishSession = useCallback(
    async (response: AuthResponse) => {
      await tokenStorage.save({ accessToken: response.accessToken, refreshToken: response.refreshToken });

      if (!response.hasStore) {
        setSession({ user: response.user, isVerified: response.isVerified, store: null });
        setNotice(null);
        setStatus('signedIn');
        return;
      }

      try {
        applyMe(await authApi.getMe());
        setNotice(null);
      } catch (error) {
        // Não deixa uma sessão "meio aberta": o usuário vê o erro no login e tenta de novo.
        await tokenStorage.clear();
        throw error;
      }
    },
    [applyMe, setSession]
  );

  const login = useCallback(
    async (input: LoginInput) => {
      await establishSession(await authApi.login(input));
      setOtpSentAt(null);
    },
    [establishSession]
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      await establishSession(await authApi.loginWithGoogle(idToken));
      setOtpSentAt(null);
    },
    [establishSession]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await establishSession(await authApi.register(input));
      // O e-mail com o código já foi disparado no cadastro: o contador de 30s começa agora.
      setOtpSentAt(Date.now());
    },
    [establishSession]
  );

  const verifyOtp = useCallback(async (code: string) => {
    await authApi.verifyOtp(code);
    setSessionState((current) => (current ? { ...current, isVerified: true } : current));
  }, []);

  const resendOtp = useCallback(async () => {
    await authApi.resendOtp();
    setOtpSentAt(Date.now());
  }, []);

  const setOtpCooldownRemaining = useCallback((seconds: number) => {
    const elapsed = Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - seconds);
    setOtpSentAt(Date.now() - elapsed * 1000);
  }, []);

  const applyStore = useCallback((store: StoreInfo) => {
    setSessionState((current) => (current ? { ...current, store } : current));
  }, []);

  const applyUser = useCallback((user: AuthUser) => {
    setSessionState((current) => (current ? { ...current, user } : current));
  }, []);

  const markUnverified = useCallback(() => {
    setSessionState((current) => (current ? { ...current, isVerified: false } : current));
  }, []);

  const clearStore = useCallback(() => {
    setSessionState((current) => (current ? { ...current, store: null } : current));
  }, []);

  const refreshMe = useCallback(async () => {
    applyMe(await authApi.getMe());
  }, [applyMe]);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    try {
      await authApi.logout();
    } catch {
      // Vai ao login mesmo se a chamada falhar (ex.: já era 401, ou sem rede).
    } finally {
      await tokenStorage.clear();
      signOutLocal(null);
      loggingOut.current = false;
    }
  }, [signOutLocal]);

  const returnToLogin = useCallback(
    async (nextNotice?: AuthNotice) => {
      await tokenStorage.clear();
      signOutLocal(nextNotice ?? null);
    },
    [signOutLocal]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      isVerified: session?.isVerified ?? false,
      store: session?.store ?? null,
      bootError,
      notice,
      otpSentAt,
      clearNotice: () => setNotice(null),
      retryBootstrap: bootstrap,
      login,
      loginWithGoogle,
      register,
      verifyOtp,
      resendOtp,
      setOtpCooldownRemaining,
      applyStore,
      applyUser,
      markUnverified,
      clearStore,
      refreshMe,
      logout,
      returnToLogin,
    }),
    [
      status,
      session,
      bootError,
      notice,
      otpSentAt,
      bootstrap,
      login,
      loginWithGoogle,
      register,
      verifyOtp,
      resendOtp,
      setOtpCooldownRemaining,
      applyStore,
      applyUser,
      markUnverified,
      clearStore,
      refreshMe,
      logout,
      returnToLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return context;
}
