import { useEffect, useState } from 'react';

// Só propaga o valor depois que ele para de mudar por `delayMs` (ex.: busca digitada pelo usuário).
// O segundo item pula a espera e aplica o valor na hora (ex.: código de barras lido pela câmera).
export function useDebouncedValue<T>(value: T, delayMs = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return [debounced, setDebounced] as const;
}
