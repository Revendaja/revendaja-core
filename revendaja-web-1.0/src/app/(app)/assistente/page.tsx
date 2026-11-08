'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelAiAction,
  confirmAiAction,
  getAiUsage,
  sendAiMessage,
  type AiAction,
  type AiCard,
} from '@/lib/api/ai';
import { getErrorMessage, isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/queryKeys';
import { formatCurrency } from '@/lib/utils/format';
import { Icon } from '@/components/dashboard/icons';

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; cards: AiCard[]; actionIds: string[] }
  | { id: string; kind: 'error'; text: string };

const SUGGESTIONS = [
  'Quanto lucrei esse mês?',
  'Quais produtos estão em falta?',
  'Quais produtos estão parados há mais de 30 dias?',
  'Quanto tenho investido em estoque?',
  'Adicione Egeo Tradicional ao meu estoque',
];

export default function AssistantPage() {
  return <Chat />;
}

function ProductCard({ card }: { card: AiCard }) {
  const detail =
    card.type === 'catalog_product'
      ? `${formatCurrency(card.price)}${card.storeProductId ? ' · já na sua loja' : ''}`
      : `${card.stock} em estoque · ${formatCurrency(card.price)}`;
  const outOfStock = card.type === 'stock_product' && card.stock === 0;

  return (
    <div className="w-40 shrink-0 rounded-2xl border border-ink-100 bg-white p-3">
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" className="h-24 w-full rounded-xl bg-ink-50 object-contain" />
      ) : (
        <div className="h-24 w-full rounded-xl bg-ink-50" />
      )}
      <p className="mt-2 truncate text-xs text-ink-400">{card.brand}</p>
      <p className="line-clamp-2 text-sm font-semibold text-ink-900">{card.name}</p>
      <p className={`mt-1 text-xs font-semibold ${outOfStock ? 'text-danger' : 'text-ink-500'}`}>
        {outOfStock ? 'Em falta · ' : ''}
        {detail}
      </p>
    </div>
  );
}

function ActionCard({
  action,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  action: AiAction;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const image = typeof action.preview?.image === 'string' ? action.preview.image : null;

  return (
    <div className="mt-2 max-w-md rounded-2xl border border-primary-200 bg-white p-4">
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-14 w-14 rounded-xl bg-ink-50 object-contain" />
        ) : null}
        <p className="flex-1 text-sm font-semibold text-ink-900">{action.summary}</p>
      </div>

      {action.status === 'pending' && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 flex-1 rounded-lg border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-10 flex-1 rounded-lg bg-primary-500 text-sm font-semibold text-white hover:bg-primary-600 disabled:bg-primary-300"
          >
            {busy ? 'Confirmando…' : 'Confirmar'}
          </button>
        </div>
      )}
      {action.status === 'executed' && <p className="mt-3 text-sm font-semibold text-success">Feito!</p>}
      {action.status === 'cancelled' && <p className="mt-3 text-sm font-semibold text-ink-400">Cancelada</p>}
      {action.status === 'expired' && (
        <p className="mt-3 text-sm font-semibold text-warning">Expirou. Peça de novo para eu refazer.</p>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Chat() {
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [actions, setActions] = useState<Record<string, AiAction>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const usageQuery = useQuery({ queryKey: queryKeys.aiUsage(), queryFn: getAiUsage, staleTime: 30_000 });
  const usage = usageQuery.data;
  const maxChars = usage?.maxMessageChars ?? 2000;
  const limitReached = usage !== undefined && usage.messages.remaining === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, sending]);

  const nextId = () => `local-${(idCounter.current += 1)}`;
  const push = (item: ChatItem) => setItems((current) => [...current, item]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending || limitReached) return;
    setText('');
    push({ id: nextId(), kind: 'user', text: message });
    setSending(true);
    try {
      const reply = await sendAiMessage({ conversationId, message });
      setConversationId(reply.conversationId);
      setActions((current) => ({
        ...current,
        ...Object.fromEntries(reply.pendingActions.map((action) => [action.id, action])),
      }));
      push({
        id: nextId(),
        kind: 'assistant',
        text: reply.message,
        cards: reply.cards,
        actionIds: reply.pendingActions.map((action) => action.id),
      });
    } catch (error) {
      push({ id: nextId(), kind: 'error', text: getErrorMessage(error) });
    } finally {
      setSending(false);
      void usageQuery.refetch();
    }
  }

  // Depois de uma alteração feita pela IA, o que mostra estoque/vendas precisa recarregar.
  function refreshAppData() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.allStoreProducts() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sales() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.storeStats() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.storePlan() });
  }

  async function settle(action: AiAction, run: () => Promise<AiAction>) {
    // Um por vez: evita confirmar duas vezes (o servidor também é idempotente).
    if (busyActionId) return undefined;
    setBusyActionId(action.id);
    setActionErrors((current) => ({ ...current, [action.id]: null }));
    try {
      const updated = await run();
      setActions((current) => ({ ...current, [action.id]: updated }));
      return updated;
    } catch (error) {
      if (isApiError(error) && error.code === 'AI_ACTION_EXPIRED') {
        setActions((current) => ({ ...current, [action.id]: { ...action, status: 'expired' } }));
      } else {
        setActionErrors((current) => ({ ...current, [action.id]: getErrorMessage(error) }));
      }
      return undefined;
    } finally {
      setBusyActionId(null);
    }
  }

  async function onConfirm(action: AiAction) {
    const updated = await settle(action, () => confirmAiAction(action.id));
    if (updated?.status === 'executed') refreshAppData();
  }

  function newConversation() {
    setItems([]);
    setActions({});
    setActionErrors({});
    setConversationId(null);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-[420px] max-w-3xl flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={18} className="text-primary-500" />
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold text-ink-900">Assistente</h1>
            {usage && (
              <p className={`text-[11px] font-medium ${limitReached ? 'text-danger' : 'text-ink-400'}`}>
                {usage.messages.remaining} de {usage.messages.limit} mensagens neste mês
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={newConversation}
          disabled={sending || items.length === 0}
          className="h-9 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
        >
          Nova conversa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl bg-ink-50 p-4">
        {items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
              <Icon name="sparkle" size={26} />
            </div>
            <h2 className="text-lg font-semibold text-ink-900">Como posso ajudar?</h2>
            <p className="mb-5 mt-1 text-sm text-ink-400">
              Pergunte sobre seu estoque, suas vendas e seu lucro, ou peça para cadastrar produtos.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                disabled={limitReached}
                className="mb-2 w-full rounded-xl border border-ink-100 bg-white px-4 py-3 text-left text-sm font-medium text-ink-700 hover:border-primary-200 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              if (item.kind === 'user') {
                return (
                  <div key={item.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-500 px-4 py-3 text-sm text-white">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === 'error') {
                return (
                  <div key={item.id} className="max-w-[85%] self-start rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                    {item.text}
                  </div>
                );
              }
              return (
                <div key={item.id} className="self-stretch">
                  <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-5 text-ink-900">
                    {item.text}
                  </div>
                  {item.cards.length > 0 && (
                    <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
                      {item.cards.map((card) => (
                        <ProductCard
                          key={card.type === 'catalog_product' ? `c${card.productId}` : `s${card.storeProductId}`}
                          card={card}
                        />
                      ))}
                    </div>
                  )}
                  {item.actionIds.map((id) => {
                    const action = actions[id];
                    if (!action) return null;
                    return (
                      <ActionCard
                        key={id}
                        action={action}
                        busy={busyActionId === id}
                        error={actionErrors[id] ?? null}
                        onConfirm={() => void onConfirm(action)}
                        onCancel={() => void settle(action, () => cancelAiAction(action.id))}
                      />
                    );
                  })}
                </div>
              );
            })}
            {sending && (
              <div className="self-start rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-ink-400">
                Pensando…
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {limitReached && usage ? (
        <div className="mt-3 rounded-2xl bg-warning-soft px-4 py-3">
          <p className="text-sm font-semibold text-ink-900">
            Você usou as {usage.messages.limit} mensagens do plano {usage.plan.name} neste mês.
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            O limite renova em{' '}
            {new Date(usage.resetsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}.{' '}
            <Link href="/planos" className="font-semibold text-primary-600 hover:underline">
              Ver planos com mais mensagens
            </Link>
          </p>
        </div>
      ) : (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(text);
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(text);
              }
            }}
            rows={1}
            maxLength={maxChars}
            disabled={sending}
            placeholder="Escreva sua pergunta…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none focus:border-primary-400"
          />
          <button
            type="submit"
            disabled={sending || text.trim().length === 0}
            className="h-11 rounded-full bg-primary-500 px-5 text-sm font-semibold text-white hover:bg-primary-600 disabled:bg-primary-200"
          >
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
