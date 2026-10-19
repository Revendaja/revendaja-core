'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import type { HomeSummary } from '@/lib/api/types';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function RevenueCard({ revenue }: { revenue: HomeSummary['revenue'] }) {
  const [visible, setVisible] = useState(true);
  const monthName = MONTH_NAMES[new Date().getMonth()];
  const growth = revenue.growthPercent;
  const growthRounded = growth === null ? 0 : Math.round(Math.abs(growth));
  const showGrowth = visible && growth !== null && growthRounded > 0;

  return (
    <div className="relative flex h-full min-h-48 flex-col justify-between overflow-hidden rounded-3xl bg-linear-to-br from-primary-500 to-primary-700 p-6 text-white shadow-lg shadow-primary-500/20">
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <WalletIcon />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Faturamento</p>
            <p className="text-xs text-white/70">{monthName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar valor' : 'Mostrar valor'}
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold transition hover:bg-white/25"
        >
          <EyeIcon off={!visible} />
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      <div className="relative mt-6">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-4xl font-extrabold tracking-tight">
            {visible ? formatCurrency(revenue.total) : 'R$ ••••••'}
          </span>
          {showGrowth && (
            <span className="mb-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-primary-700">
              {growth >= 0 ? '↑' : '↓'} {growthRounded}% vs. mês anterior
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-white/70">Considera só as vendas já recebidas</p>
      </div>
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M15 15h2" />
      <path d="M7 7V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="m3 3 18 18" />}
    </svg>
  );
}
