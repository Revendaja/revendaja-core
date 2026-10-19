import { useCallback, useEffect, useRef, useState } from 'react';
import { STOCK_MAX } from '@/lib/utils/format';

type Options = {
  // Estoque confirmado pela API (o que está na lista).
  current: number;
  // Salva o estoque ABSOLUTO no servidor (PATCH { stock }). Deve atualizar a lista local com a resposta.
  save: (stock: number) => Promise<unknown>;
  onError: (error: unknown) => void;
  // Espera depois do último clique antes de salvar (agrupa cliques rápidos em um único PATCH).
  delayMs?: number;
};

// Stepper (+/−) que altera o estoque de verdade. O número muda na hora (otimista), cliques rápidos viram UM
// PATCH com o total final, nunca há duas gravações simultâneas e, se falhar, volta ao valor do servidor.
export function useStockStepper({ current, save, onError, delayMs = 500 }: Options) {
  // Valor pedido pelo usuário e ainda não confirmado (null = nada pendente).
  const [pending, setPending] = useState<number | null>(null);
  const desired = useRef<number | null>(null);
  // Último valor que a API confirmou durante esta sequência de cliques.
  const confirmed = useRef<number | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs sempre com a versão mais recente, para o flush (assíncrono) não usar valores velhos.
  const currentRef = useRef(current);
  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);
  // O flush chama a si mesmo (clique durante a gravação): vai por ref para não se referenciar antes de existir.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    currentRef.current = current;
    saveRef.current = save;
    onErrorRef.current = onError;
  });

  const flush = useCallback(async () => {
    // Já tem uma gravação em andamento: ela mesma chama o flush de novo se ainda houver algo pendente.
    if (inFlight.current) return;
    const target = desired.current;
    if (target === null) return;
    if (target === (confirmed.current ?? currentRef.current)) {
      // Clicou + e depois − (ou o contrário): o servidor já tem esse total, não há o que salvar.
      desired.current = null;
      confirmed.current = null;
      setPending(null);
      return;
    }

    inFlight.current = true;
    try {
      await saveRef.current(target);
    } catch (error) {
      // Falhou: volta ao valor que o servidor tem e avisa.
      inFlight.current = false;
      desired.current = null;
      confirmed.current = null;
      setPending(null);
      onErrorRef.current(error);
      return;
    }
    inFlight.current = false;
    confirmed.current = target;

    if (desired.current === target) {
      desired.current = null;
      confirmed.current = null;
      setPending(null);
    } else {
      // O usuário clicou mais enquanto salvava: grava o novo total.
      void flushRef.current();
    }
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const step = useCallback(
    (delta: number) => {
      const base = desired.current ?? currentRef.current;
      const next = Math.min(STOCK_MAX, Math.max(0, base + delta));
      if (next === base) return;
      desired.current = next;
      setPending(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  // Saiu da tela (ou a linha saiu da lista) com clique pendente: grava agora, não perde a alteração.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (desired.current !== null) void flush();
    },
    [flush],
  );

  return {
    // O que mostrar: o valor pendente (já refletindo os cliques) ou o confirmado.
    value: pending ?? current,
    // Há alteração ainda não confirmada pelo servidor.
    saving: pending !== null,
    increment: useCallback(() => step(1), [step]),
    decrement: useCallback(() => step(-1), [step]),
  };
}
