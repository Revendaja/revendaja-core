'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';

export const CODE_LENGTH = 6;

export function CodeInput({
  label,
  value,
  onChangeText,
  error,
  disabled,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (digits: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(CODE_LENGTH, ' ').split('');

  function setDigit(index: number, char: string) {
    const next = value.split('');
    next[index] = char;
    const joined = next.join('').slice(0, CODE_LENGTH).replace(/\s/g, '');
    onChangeText(joined);
  }

  function handleChange(index: number, rawValue: string) {
    const pasted = rawValue.replace(/\D/g, '');
    if (pasted.length > 1) {
      // Colou o código inteiro (ou parte dele) numa única caixa.
      const merged = (value.slice(0, index) + pasted).slice(0, CODE_LENGTH);
      onChangeText(merged);
      const focusIndex = Math.min(merged.length, CODE_LENGTH - 1);
      inputsRef.current[focusIndex]?.focus();
      return;
    }

    const char = pasted.slice(-1);
    setDigit(index, char);
    if (char && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-bold text-ink-500">{label}</label>
      <div className="flex justify-between gap-2">
        {Array.from({ length: CODE_LENGTH }).map((_, index) => (
          <input
            key={index}
            ref={(element) => {
              inputsRef.current[index] = element;
            }}
            value={digits[index]?.trim() ?? ''}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            className={cn(
              'h-14 w-12 rounded-2xl border bg-ink-50 text-center text-xl font-extrabold text-ink-900 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60',
              error ? 'border-danger' : 'border-transparent'
            )}
          />
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
