'use client';

import { useEffect, useId, useState } from 'react';

// Campo numérico do simulador. Guarda o texto digitado à parte do número (assim dá para apagar tudo e
// digitar de novo, e "5," não vira 5 no meio da digitação) e só avisa o número quando é válido.
// `scale` converte a exibição: 100 mostra 0,4 como 40 (para percentuais guardados de 0 a 1).
export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  prefix,
  suffix,
  scale = 1,
  hint,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  scale?: number;
  hint?: string;
  compact?: boolean;
}) {
  const id = useId();
  const display = (n: number) => String(Math.round(n * scale * 1e6) / 1e6);
  const [text, setText] = useState(display(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  return (
    <div className={compact ? 'min-w-0' : 'flex flex-col gap-1'}>
      <label htmlFor={id} className={`text-[12px] font-medium text-ink-600 ${compact ? 'sr-only' : ''}`}>
        {label}
      </label>
      <div className="flex h-9 items-center rounded-lg border border-ink-200 bg-white px-2 focus-within:border-primary-500">
        {prefix && <span className="mr-1 text-[12px] text-ink-400">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseFloat(event.target.value.replace(',', '.'));
            if (!Number.isFinite(parsed)) return;
            let next = parsed / scale;
            if (next < min) next = min;
            if (max !== undefined && next > max) next = max;
            onChange(next);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-[13px] text-ink-900 outline-none"
        />
        {suffix && <span className="ml-1 text-[12px] text-ink-400">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}
