import { useEffect, useState } from 'react';

// Devolve `value` só depois de ficar `delayMs` sem mudar (para não buscar a cada tecla).
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
