'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '@/lib/api/coupons';
import { getErrorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queryKeys';
import type { Coupon, CouponType } from '@/lib/api/types';
import { couponDetails, couponDiscountLabel, couponStatus, endOfDayIso, type CouponStatusKey } from '@/lib/utils/coupons';
import { parsePriceInput } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';
import { Banner, Field, MoneyField, PageHeader, SubmitButton, TextInput, Toggle } from '@/components/products/FormParts';

const CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

const STATUS_STYLE: Record<CouponStatusKey, string> = {
  active: 'bg-success-soft text-success',
  off: 'bg-ink-100 text-ink-500',
  expired: 'bg-danger-soft text-danger',
  exhausted: 'bg-warning-soft text-warning',
};

const TYPE_OPTIONS: { key: CouponType; label: string }[] = [
  { key: 'percent', label: 'Porcentagem' },
  { key: 'fixed', label: 'Valor fixo' },
];

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const couponsQuery = useQuery({ queryKey: queryKeys.coupons(), queryFn: listCoupons });
  const coupons = couponsQuery.data?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.coupons() });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateCoupon(id, { isActive }),
    onSuccess: () => void refresh(),
    onError: (error) => setActionError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      setConfirmingId(null);
      void refresh();
    },
    onError: (error) => {
      setConfirmingId(null);
      setActionError(getErrorMessage(error));
    },
  });

  return (
    <div className="w-full">
      <PageHeader title="Cupons de desconto" subtitle="Crie códigos para os clientes usarem no carrinho da vitrine" backHref="/loja" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          {actionError && <Banner type="error" message={actionError} />}

          {couponsQuery.isPending && <div className="h-28 animate-pulse rounded-2xl border border-ink-100 bg-ink-50" />}

          {couponsQuery.isError && (
            <div className="rounded-2xl border border-ink-100 p-8 text-center">
              <p className="mb-3 text-sm font-medium text-danger">{getErrorMessage(couponsQuery.error)}</p>
              <button
                type="button"
                onClick={() => void couponsQuery.refetch()}
                className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {couponsQuery.isSuccess && coupons.length === 0 && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                <Icon name="ticket" size={22} />
              </span>
              <p className="mt-4 text-sm font-semibold text-ink-900">Você ainda não tem cupons</p>
              <p className="mt-1 max-w-xs text-xs text-ink-400">
                Crie o primeiro ao lado. O cliente digita o código no carrinho e o desconto é aplicado no pedido.
              </p>
            </div>
          )}

          {coupons.map((coupon) => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              confirming={confirmingId === coupon.id}
              busy={toggleMutation.isPending || deleteMutation.isPending}
              onToggle={(isActive) => {
                setActionError(null);
                toggleMutation.mutate({ id: coupon.id, isActive });
              }}
              onAskDelete={() => {
                setActionError(null);
                setConfirmingId(coupon.id);
              }}
              onCancelDelete={() => setConfirmingId(null)}
              onConfirmDelete={() => deleteMutation.mutate(coupon.id)}
            />
          ))}
        </div>

        <NewCouponForm onCreated={() => void refresh()} />
      </div>
    </div>
  );
}

function CouponCard({
  coupon,
  confirming,
  busy,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  coupon: Coupon;
  confirming: boolean;
  busy: boolean;
  onToggle: (isActive: boolean) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const status = couponStatus(coupon);

  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-4" aria-label={`Cupom ${coupon.code}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Icon name="ticket" size={20} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-base font-bold tracking-wide text-ink-900">{coupon.code}</p>
            <p className="text-sm text-ink-600">{couponDiscountLabel(coupon)}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[status.key]}`}>{status.label}</span>
      </div>

      <p className="mt-3 text-xs text-ink-500">{couponDetails(coupon).join(' · ')}</p>

      {confirming ? (
        <div className="mt-3 animate-fade-up rounded-xl border border-danger/30 bg-danger-soft p-3">
          <p className="text-xs font-semibold text-danger">Apagar o cupom {coupon.code}?</p>
          <p className="mt-1 text-xs text-danger/80">As vendas que já usaram o cupom continuam com o desconto.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              className="h-9 flex-1 rounded-lg border border-ink-200 bg-white text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={busy}
              className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-white transition hover:bg-danger/90 disabled:opacity-60"
            >
              Apagar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
            <Toggle checked={coupon.isActive} onChange={onToggle} disabled={busy} label={`Cupom ${coupon.code} ligado`} />
            Disponível para os clientes
          </label>
          <button
            type="button"
            onClick={onAskDelete}
            disabled={busy}
            aria-label={`Apagar cupom ${coupon.code}`}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60"
          >
            <Icon name="trash" size={14} />
            Apagar
          </button>
        </div>
      )}
    </article>
  );
}

function NewCouponForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<CouponType>('percent');
  const [percent, setPercent] = useState('');
  const [fixed, setFixed] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createCoupon,
    onSuccess: () => {
      setCode('');
      setPercent('');
      setFixed('');
      setMinOrder('');
      setMaxUses('');
      setExpiresOn('');
      setErrors({});
      setFormError(null);
      onCreated();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};

    const cleanCode = code.replace(/\s+/g, '').toUpperCase();
    if (!CODE_PATTERN.test(cleanCode)) next.code = 'Use de 3 a 20 letras, números, "-" ou "_".';

    let value: number | null = null;
    if (type === 'percent') {
      const parsed = /^\d{1,3}$/.test(percent.trim()) ? Number(percent) : NaN;
      if (!(parsed >= 1 && parsed <= 100)) next.value = 'Informe de 1% a 100%.';
      else value = parsed;
    } else {
      value = parsePriceInput(fixed);
      if (value === null || value <= 0) next.value = 'Informe o valor do desconto.';
    }

    let min: number | null = null;
    if (minOrder.trim()) {
      min = parsePriceInput(minOrder);
      if (min === null || min <= 0) next.minOrder = 'Valor inválido.';
    }

    let uses: number | null = null;
    if (maxUses.trim()) {
      uses = /^\d{1,7}$/.test(maxUses.trim()) ? Number(maxUses) : NaN;
      if (!(uses >= 1)) next.maxUses = 'Informe um número a partir de 1.';
    }

    let expiresAt: string | null = null;
    if (expiresOn) {
      expiresAt = endOfDayIso(expiresOn);
      if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) next.expiresOn = 'Escolha uma data de hoje em diante.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || value === null) return;

    mutation.mutate({ code: cleanCode, type, value, minOrder: min, maxUses: uses, expiresAt });
  }

  return (
    <form onSubmit={submit} noValidate className="h-fit rounded-2xl border border-ink-100 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink-900">Novo cupom</h2>
      {formError && <Banner type="error" message={formError} />}

      <div className="flex flex-col gap-4">
        <Field label="Código" hint="O que o cliente digita. Ex.: VERAO10" error={errors.code}>
          <TextInput
            value={code}
            onChange={(value) => setCode(value.toUpperCase().replace(/\s/g, ''))}
            maxLength={20}
            placeholder="VERAO10"
            autoCapitalize="characters"
            aria-label="Código do cupom"
            error={errors.code}
            disabled={mutation.isPending}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-600">Tipo de desconto</p>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setType(option.key)}
                aria-pressed={type === option.key}
                disabled={mutation.isPending}
                className={`h-10 rounded-xl text-xs font-semibold transition ${
                  type === option.key ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'percent' ? (
          <Field label="Desconto (%)" error={errors.value}>
            <TextInput
              value={percent}
              onChange={(value) => setPercent(value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              placeholder="10"
              aria-label="Desconto em porcentagem"
              error={errors.value}
              disabled={mutation.isPending}
            />
          </Field>
        ) : (
          <MoneyField label="Desconto (R$)" value={fixed} onChange={setFixed} error={errors.value} disabled={mutation.isPending} />
        )}

        <MoneyField
          label="Pedido mínimo (opcional)"
          hint="Só vale se a soma dos produtos chegar a esse valor."
          value={minOrder}
          onChange={setMinOrder}
          error={errors.minOrder}
          disabled={mutation.isPending}
        />

        <Field label="Limite de usos (opcional)" hint="Vazio = sem limite." error={errors.maxUses}>
          <TextInput
            value={maxUses}
            onChange={(value) => setMaxUses(value.replace(/\D/g, '').slice(0, 7))}
            inputMode="numeric"
            placeholder="Ex.: 50"
            aria-label="Limite de usos"
            error={errors.maxUses}
            disabled={mutation.isPending}
          />
        </Field>

        <Field label="Vale até (opcional)" hint="Vazio = não vence." error={errors.expiresOn}>
          <TextInput
            type="date"
            value={expiresOn}
            onChange={setExpiresOn}
            aria-label="Data de validade"
            error={errors.expiresOn}
            disabled={mutation.isPending}
          />
        </Field>

        <SubmitButton loading={mutation.isPending}>Criar cupom</SubmitButton>
      </div>
    </form>
  );
}
