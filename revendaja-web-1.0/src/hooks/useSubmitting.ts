import { useCallback, useRef, useState } from 'react';

// Envolve uma ação assíncrona de formulário: expõe `loading` e ignora um segundo disparo enquanto o
// primeiro não termina. O lock é um ref (síncrono), então dois cliques no mesmo frame também não passam.
export function useSubmitting() {
  const [loading, setLoading] = useState(false);
  const locked = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    try {
      await action();
    } finally {
      locked.current = false;
      setLoading(false);
    }
  }, []);

  return { loading, run };
}
