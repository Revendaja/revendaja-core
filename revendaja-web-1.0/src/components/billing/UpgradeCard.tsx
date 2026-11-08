'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getStorePlan } from '@/lib/api/stores';
import { queryKeys } from '@/lib/api/queryKeys';
import { Icon } from '@/components/dashboard/icons';

const BENEFITS = [
  'Assistente de IA com 150 mensagens por mês (no Gratuito são 15)',
  'Até 200 produtos, com cadastro manual e kits',
  'Categorias, promoções e relatório dos mais vendidos',
];

// Lembrete fixo no painel para quem está no plano Gratuito: mostra o que o Inicial libera.
// Some sozinho para qualquer plano pago (e enquanto o plano ainda não carregou).
export function UpgradeCard() {
  const planQuery = useQuery({ queryKey: queryKeys.storePlan(), queryFn: getStorePlan });
  if (planQuery.data?.plan.id !== 'free') return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Icon name="sparkle" size={11} strokeWidth={2} />
            Você está no plano Gratuito
          </span>
          <h2 className="mt-2 text-[15px] font-semibold text-ink-900">
            Venda mais com o plano Inicial por R$ 29,99/mês
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-xs text-ink-600">
                <Icon name="check" size={13} strokeWidth={2.6} className="text-success" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/planos"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary-500 px-5 text-sm font-semibold text-white transition hover:bg-primary-600"
        >
          Conhecer planos pagos
        </Link>
      </div>
    </section>
  );
}
