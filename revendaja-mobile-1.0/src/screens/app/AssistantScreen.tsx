import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ProductImage from '../../components/ProductImage';
import {
  cancelAiAction,
  confirmAiAction,
  getAiUsage,
  sendAiMessage,
  transcribeAiAudio,
  type AiAction,
  type AiCard,
} from '../../api/ai';
import { getErrorMessage, isApiError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { formatCurrency } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

// Vive na pilha raiz, fora das abas (abre por cima da navbar), como Notificações.
type Props = NativeStackScreenProps<RootStackParamList, 'Assistant'>;

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; cards: AiCard[]; actionIds: string[] }
  | { id: string; kind: 'error'; text: string };

// Valores de reserva; os do servidor (GET /ai/usage) valem assim que carregam.
const FALLBACK_MAX_MESSAGE_CHARS = 2000;
const FALLBACK_MAX_AUDIO_SECONDS = 60;

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const SUGGESTIONS = [
  'Quanto lucrei esse mês?',
  'Quais produtos estão em falta?',
  'Quais produtos estão parados há mais de 30 dias?',
  'Quanto tenho investido em estoque?',
  'Adicione Egeo Tradicional ao meu estoque',
];

function ProductCard({ card }: { card: AiCard }) {
  const detail =
    card.type === 'catalog_product'
      ? `${formatCurrency(card.price)}${card.storeProductId ? ' · já na sua loja' : ''}`
      : `${card.stock} em estoque · ${formatCurrency(card.price)}`;
  const lowStock = card.type === 'stock_product' && card.stock === 0;

  return (
    <View className="w-40 bg-white rounded-2xl p-3 mr-3 border border-ink-100">
      <ProductImage uri={card.image} style={{ width: '100%', height: 96, borderRadius: 12 }} />
      <Text className="text-xs text-ink-400 mt-2" numberOfLines={1}>
        {card.brand}
      </Text>
      <Text className="text-sm font-bold text-ink-900" numberOfLines={2}>
        {card.name}
      </Text>
      <Text className={`text-xs mt-1 font-semibold ${lowStock ? 'text-danger' : 'text-ink-500'}`}>
        {lowStock ? 'Em falta · ' : ''}
        {detail}
      </Text>
    </View>
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
  const pending = action.status === 'pending';

  return (
    <View className="bg-white rounded-2xl p-4 mt-2 border border-primary-200">
      <View className="flex-row items-center gap-3">
        <ProductImage uri={image} style={{ width: 56, height: 56, borderRadius: 12 }} />
        <Text className="flex-1 text-sm font-semibold text-ink-900">{action.summary}</Text>
      </View>

      {pending && (
        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
            className="flex-1 h-11 rounded-full border border-ink-200 items-center justify-center"
          >
            <Text className="text-sm font-bold text-ink-700">Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Confirmar operação"
            className={`flex-1 h-11 rounded-full items-center justify-center ${busy ? 'bg-primary-300' : 'bg-primary-500'}`}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-bold text-white">Confirmar</Text>}
          </Pressable>
        </View>
      )}

      {action.status === 'executed' && (
        <View className="flex-row items-center gap-2 mt-3">
          <Ionicons name="checkmark-circle" size={18} color="#1FAA59" />
          <Text className="text-sm font-bold text-success">Feito!</Text>
        </View>
      )}
      {action.status === 'cancelled' && <Text className="text-sm font-bold text-ink-400 mt-3">Cancelada</Text>}
      {action.status === 'expired' && (
        <Text className="text-sm font-bold text-warning mt-3">Expirou. Peça de novo para eu refazer.</Text>
      )}
      {error && <Text className="text-sm text-danger mt-3">{error}</Text>}
    </View>
  );
}

export default function AssistantScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatItem>>(null);
  const idCounter = useRef(0);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [actions, setActions] = useState<Record<string, AiAction>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Quanto resta do limite do plano neste mês (e os tamanhos máximos de texto e de áudio).
  const usageQuery = useQuery({ queryKey: queryKeys.ai.usage(), queryFn: getAiUsage, staleTime: 30_000 });
  const usage = usageQuery.data;
  const maxChars = usage?.maxMessageChars ?? FALLBACK_MAX_MESSAGE_CHARS;
  const maxAudioSeconds = usage?.maxAudioSeconds ?? FALLBACK_MAX_AUDIO_SECONDS;
  const limitReached = usage !== undefined && usage.messages.remaining === 0;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recording = recorderState.isRecording;
  const recordedSeconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  const nextId = () => `local-${(idCounter.current += 1)}`;
  const push = useCallback((item: ChatItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || sending) return;
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
    },
    [conversationId, push, sending]
  );

  // Depois de uma alteração feita pela IA, as telas que mostram estoque/vendas precisam recarregar.
  const refreshAppData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.storeProducts.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.storeStats() });
  }, [queryClient]);

  const settle = useCallback(async (action: AiAction, run: () => Promise<AiAction>) => {
    // Um toque por vez: evita enviar a confirmação duas vezes (o servidor também é idempotente).
    if (busyActionId) return;
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
  }, [busyActionId]);

  const onConfirm = useCallback(
    async (action: AiAction) => {
      const updated = await settle(action, () => confirmAiAction(action.id));
      if (updated?.status === 'executed') refreshAppData();
    },
    [refreshAppData, settle]
  );

  const onCancel = useCallback(
    (action: AiAction) => {
      void settle(action, () => cancelAiAction(action.id));
    },
    [settle]
  );

  const startRecording = useCallback(async () => {
    if (sending || transcribing || recording) return;
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        push({
          id: nextId(),
          kind: 'error',
          text: 'Para falar com o assistente, permita o uso do microfone nas configurações do aparelho.',
        });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      push({ id: nextId(), kind: 'error', text: 'Não foi possível começar a gravar. Tente novamente.' });
    }
  }, [push, recorder, recording, sending, transcribing]);

  // Para a gravação. Com `discard`, joga o áudio fora; senão manda para transcrever e coloca o texto
  // no campo — a usuária revisa antes de enviar (e só aí a mensagem conta no limite).
  const stopRecording = useCallback(
    async (discard: boolean) => {
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
      } catch {
        return;
      }
      const uri = recorder.uri;
      if (discard || !uri) return;

      setTranscribing(true);
      try {
        const { text: spoken } = await transcribeAiAudio(uri);
        if (spoken) setText((current) => (current ? `${current} ${spoken}` : spoken).slice(0, maxChars));
        else push({ id: nextId(), kind: 'error', text: 'Não consegui ouvir nada. Tente falar de novo.' });
      } catch (error) {
        push({ id: nextId(), kind: 'error', text: getErrorMessage(error) });
      } finally {
        setTranscribing(false);
        void usageQuery.refetch();
      }
    },
    [maxChars, push, recorder]
  );

  // Passou do tempo máximo: encerra sozinho e transcreve o que foi gravado.
  useEffect(() => {
    if (recording && recordedSeconds >= maxAudioSeconds) void stopRecording(false);
  }, [maxAudioSeconds, recording, recordedSeconds, stopRecording]);

  const newConversation = useCallback(() => {
    setItems([]);
    setActions({});
    setActionErrors({});
    setConversationId(null);
  }, []);

  const renderItem = ({ item }: { item: ChatItem }) => {
    if (item.kind === 'user') {
      return (
        <View className="self-end max-w-[85%] bg-primary-500 rounded-2xl rounded-br-md px-4 py-3 mb-3">
          <Text className="text-white text-sm">{item.text}</Text>
        </View>
      );
    }
    if (item.kind === 'error') {
      return (
        <View className="self-start max-w-[85%] bg-danger-bg rounded-2xl px-4 py-3 mb-3">
          <Text className="text-danger text-sm">{item.text}</Text>
        </View>
      );
    }
    return (
      <View className="mb-3 self-stretch">
        <View className="self-start max-w-[90%] bg-white rounded-2xl rounded-bl-md px-4 py-3">
          <Text className="text-ink-900 text-sm leading-5">{item.text}</Text>
        </View>
        {item.cards.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            {item.cards.map((card) => (
              <ProductCard key={card.type === 'catalog_product' ? `c${card.productId}` : `s${card.storeProductId}`} card={card} />
            ))}
          </ScrollView>
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
              onCancel={() => onCancel(action)}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ink-50">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          className="w-10 h-10 rounded-full bg-white items-center justify-center"
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={20} color="#1A1B25" />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Ionicons name="sparkles" size={16} color="#FF6B00" />
          <View className="items-center">
            <Text className="text-base font-extrabold text-ink-900">Assistente</Text>
            {usage && (
              <Text className={`text-[11px] font-semibold ${limitReached ? 'text-danger' : 'text-ink-400'}`}>
                {usage.messages.remaining} de {usage.messages.limit} mensagens neste mês
              </Text>
            )}
          </View>
        </View>
        <Pressable
          className="w-10 h-10 rounded-full bg-white items-center justify-center"
          onPress={newConversation}
          disabled={sending || items.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Nova conversa"
        >
          <Ionicons name="create-outline" size={20} color={sending || items.length === 0 ? '#C7C9D9' : '#1A1B25'} />
        </Pressable>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {items.length === 0 ? (
          <ScrollView className="flex-1" contentContainerClassName="px-4 pt-6 pb-4" keyboardShouldPersistTaps="handled">
            <View className="items-center mb-6">
              <View className="w-14 h-14 rounded-2xl bg-primary-50 items-center justify-center mb-3">
                <Ionicons name="sparkles" size={26} color="#FF6B00" />
              </View>
              <Text className="text-lg font-extrabold text-ink-900 mb-1">Como posso ajudar?</Text>
              <Text className="text-sm text-ink-400 text-center">
                Pergunte sobre seu estoque, suas vendas e seu lucro, ou peça para cadastrar produtos.
              </Text>
            </View>
            {SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => void send(suggestion)}
                accessibilityRole="button"
                className="bg-white rounded-2xl px-4 py-3 mb-2 border border-ink-100"
              >
                <Text className="text-sm font-semibold text-ink-700">{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerClassName="px-4 pt-2 pb-4"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={
              sending ? (
                <View className="self-start bg-white rounded-2xl rounded-bl-md px-4 py-3 flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#FF6B00" />
                  <Text className="text-sm text-ink-400">Pensando…</Text>
                </View>
              ) : undefined
            }
          />
        )}

        {limitReached && usage ? (
          <View className="mx-4 mb-3 bg-warning-bg rounded-2xl px-4 py-3">
            <Text className="text-sm font-semibold text-ink-900">
              Você usou as {usage.messages.limit} mensagens do plano {usage.plan.name} neste mês.
            </Text>
            <Text className="text-xs text-ink-500 mt-0.5">
              O limite renova em {new Date(usage.resetsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}.
            </Text>
          </View>
        ) : recording || transcribing ? (
          <View className="flex-row items-center gap-3 px-4 pt-2 pb-3 bg-ink-50">
            <Pressable
              onPress={() => void stopRecording(true)}
              disabled={transcribing}
              accessibilityRole="button"
              accessibilityLabel="Cancelar gravação"
              className="w-11 h-11 rounded-full bg-white items-center justify-center"
            >
              <Ionicons name="close" size={20} color="#1A1B25" />
            </Pressable>
            <View className="flex-1 h-11 bg-white rounded-3xl px-4 flex-row items-center gap-2">
              {transcribing ? (
                <>
                  <ActivityIndicator size="small" color="#FF6B00" />
                  <Text className="text-sm text-ink-500">Transcrevendo…</Text>
                </>
              ) : (
                <>
                  <View className="w-2.5 h-2.5 rounded-full bg-danger" />
                  <Text className="text-sm font-semibold text-ink-900">
                    Gravando {formatClock(recordedSeconds)} / {formatClock(maxAudioSeconds)}
                  </Text>
                </>
              )}
            </View>
            <Pressable
              onPress={() => void stopRecording(false)}
              disabled={transcribing}
              accessibilityRole="button"
              accessibilityLabel="Parar e transcrever"
              className={`w-11 h-11 rounded-full items-center justify-center ${transcribing ? 'bg-primary-200' : 'bg-primary-500'}`}
            >
              <Ionicons name="checkmark" size={22} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-end gap-2 px-4 pt-2 pb-3 bg-ink-50">
            <Pressable
              onPress={() => void startRecording()}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Falar com o assistente"
              className="w-11 h-11 rounded-full bg-white items-center justify-center"
            >
              <Ionicons name="mic-outline" size={20} color={sending ? '#C7C9D9' : '#FF6B00'} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Escreva ou toque no microfone"
              placeholderTextColor="#8B8FA3"
              multiline
              maxLength={maxChars}
              editable={!sending}
              className="flex-1 min-h-[44px] max-h-32 bg-white rounded-3xl px-4 py-3 text-sm text-ink-900"
            />
            <Pressable
              onPress={() => void send(text)}
              disabled={sending || text.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem"
              className={`w-11 h-11 rounded-full items-center justify-center ${
                sending || text.trim().length === 0 ? 'bg-primary-200' : 'bg-primary-500'
              }`}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
