'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminSession } from '@/lib/api/admin';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  DEFAULT_EDITABLE,
  inputsFromEditable,
  mergeEditable,
  type EditableCosts,
  type EditablePlanId,
} from './editable';
import type { ChannelId } from './costModel';

// Só consulta a API de administração quando há sessão. 403 (conta comum) vira `false` sem retentar
// nem poluir o console: o menu só mostra a área de administração para quem é admin de verdade.
export function useIsAdmin(): { isAdmin: boolean; checked: boolean } {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: ['admin', 'session'],
    queryFn: getAdminSession,
    enabled: status === 'signedIn',
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { isAdmin: query.isSuccess, checked: query.isSuccess || query.isError };
}

const STORAGE_KEY = 'revendaja:admin:costs:v2';

// Os preços e custos editáveis, guardados no navegador (cada administradora vê os seus). Mudar um
// valor na página Custos e planos reflete na Visão geral e na página de IA, porque todas usam as
// mesmas premissas (`inputs`), derivadas do que foi editado.
export function useCostInputs() {
  const [editable, setEditable] = useState<EditableCosts>(DEFAULT_EDITABLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setEditable(mergeEditable(JSON.parse(raw)));
    } catch {
      // Armazenamento bloqueado ou conteúdo inválido: segue com os padrões.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(editable));
    } catch {
      // Sem armazenamento: tudo funciona, só não lembra da próxima vez.
    }
  }, [editable, loaded]);

  const setPrice = useCallback(
    (plan: EditablePlanId, value: number) =>
      setEditable((current) => ({ ...current, prices: { ...current.prices, [plan]: value } })),
    [],
  );
  const setService = useCallback(
    (service: keyof EditableCosts['servicesUsd'], value: number) =>
      setEditable((current) => ({ ...current, servicesUsd: { ...current.servicesUsd, [service]: value } })),
    [],
  );
  const setChannelShare = useCallback(
    (channel: ChannelId, value: number) =>
      setEditable((current) => ({ ...current, channelShares: { ...current.channelShares, [channel]: value } })),
    [],
  );
  const reset = useCallback(() => setEditable(DEFAULT_EDITABLE), []);
  const inputs = useMemo(() => inputsFromEditable(editable), [editable]);

  return { inputs, editable, setPrice, setService, setChannelShare, reset, loaded };
}
