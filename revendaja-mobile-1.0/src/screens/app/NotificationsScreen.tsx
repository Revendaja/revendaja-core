import React from 'react';
import { Animated, Image, View, Text, FlatList, Pressable, Alert } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ErrorState, ListFooter } from '../../components/ListStates';
import { SaleRowSkeleton, SkeletonRows } from '../../components/Skeleton';
import {
  deleteNotification,
  listNotifications,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from '../../api/notifications';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import type { AppNotification, NotificationType, Paginated } from '../../api/types';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type NotificationsCache = InfiniteData<Paginated<AppNotification>, number>;

// Vive na pilha raiz, fora das abas de propósito (abre por cima de tudo, inclusive da navbar — ver
// navigation/types.ts).
type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_META: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; image?: ImageSourcePropType }
> = {
  // TODO: assumi que o ícone de teste (sacola com check) é pro tipo SYSTEM — troque aqui se era pra
  // outro tipo. Sem `image`, o tipo cai no ícone do Ionicons (fallback), até você mandar o PNG dele.
  SYSTEM: { icon: 'notifications-outline', color: '#FF6B00', image: require('../../../assets/notifications/new-sale.png') },
  STOCK_LOW: { icon: 'bag-remove-outline', color: '#E0453F', image: require('../../../assets/notifications/stock-low.png') },
  GOAL: { icon: 'flag', color: '#1FAA59' },
  PROMOTION: { icon: 'megaphone-outline', color: '#E0952B' },
};

// Largura do fundo vermelho revelado ao arrastar — bem mais que metade do card, do jeito pedido.
const SWIPE_ACTION_WIDTH = 220;
const SWIPE_TRIGGER_THRESHOLD = 100;

// Linha isolada num componente próprio (não inline no `renderItem`): precisa de estado/Animated
// PRÓPRIO por notificação (a altura medida, a animação de encolher), o que só funciona certo
// como uma instância de componente de verdade, não como uma função anônima recriada a cada render.
function NotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
  onDelete: (id: string) => void;
}) {
  const meta = TYPE_META[item.type];
  const [measuredHeight, setMeasuredHeight] = React.useState<number | null>(null);
  const heightFactor = React.useRef(new Animated.Value(1)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const collapsing = React.useRef(false);

  // Encolhe a PRÓPRIA linha (altura + opacidade) e só DEPOIS tira da lista — assim, quando o item
  // realmente some dos dados, ele já está com altura zero e não sobra nenhum salto pras linhas de
  // baixo subirem. Mais confiável que `LayoutAnimation` dentro de uma FlatList (conhecido por ser
  // instável, principalmente no Android).
  function collapseAndDelete() {
    if (collapsing.current) return;
    collapsing.current = true;
    Animated.parallel([
      Animated.timing(heightFactor, { toValue: 0, duration: 220, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => onDelete(item.id));
  }

  return (
    <Animated.View
      style={{
        opacity,
        overflow: 'hidden',
        height: measuredHeight === null ? undefined : Animated.multiply(heightFactor, measuredHeight),
      }}
      onLayout={(event) => {
        if (measuredHeight === null) setMeasuredHeight(event.nativeEvent.layout.height);
      }}
    >
      <Swipeable
        overshootRight={false}
        rightThreshold={SWIPE_TRIGGER_THRESHOLD}
        friction={1.8}
        // Passar desse tanto de arrasto e soltar já dispara a exclusão sozinha — não precisa soltar
        // e tocar de novo no ícone (mesmo comportamento do Mercado Pago).
        onSwipeableWillOpen={(direction) => {
          if (direction === 'right') collapseAndDelete();
        }}
        renderRightActions={(_progress, dragX) => {
          // Contrabalança o arrasto: o painel (largura fixa) fica "colado" revelando aos poucos, em
          // vez do ícone escorregar junto com o dedo — ele fica parado no lugar.
          const translateX = dragX.interpolate({
            inputRange: [-SWIPE_ACTION_WIDTH, 0],
            outputRange: [0, SWIPE_ACTION_WIDTH],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View style={{ width: SWIPE_ACTION_WIDTH, transform: [{ translateX }] }}>
              <Pressable
                onPress={collapseAndDelete}
                accessibilityRole="button"
                accessibilityLabel={`Excluir notificação: ${item.title}`}
                className="flex-1 bg-danger justify-center items-center"
              >
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </Pressable>
            </Animated.View>
          );
        }}
      >
        <Pressable
          onPress={() => onPress(item)}
          // items-start (não items-center): o ícone fica ancorado no topo da linha, alinhado com o
          // título — igual a referência —, em vez de centralizado com o bloco de texto inteiro
          // (que pode ter 2 linhas).
          className="flex-row items-start bg-white px-5 py-3.5"
        >
          <View className="w-12 h-12 rounded-xl items-center justify-center mr-3 bg-white border border-ink-100 overflow-hidden">
            {meta.image ? (
              <Image source={meta.image} style={{ width: 30, height: 30 }} resizeMode="contain" />
            ) : (
              <Ionicons name={meta.icon} size={22} color={meta.color} />
            )}
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-xs text-ink-500 mt-0.5" numberOfLines={2}>
              {item.message}
            </Text>
          </View>
          <Text className="text-[11px] text-ink-400">{formatRelativeTime(item.createdAt)}</Text>
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
}

export default function NotificationsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();

  const list = usePaginatedList<AppNotification>(
    (page, pageSize) => listNotifications(page, pageSize),
    { pageSize: NOTIFICATIONS_PAGE_SIZE, queryKey: queryKeys.notifications.list() }
  );
  // Ganha foco de novo (ex.: voltar do Estoque depois de tocar num alerta de estoque baixo) revalida
  // sozinho se o cache já estiver velho — mesmo padrão das outras listas do app.
  useRefetchOnFocus(queryKeys.notifications.all());

  // Otimista: tira o item da lista/desconta o não-lido na hora, sem esperar o servidor confirmar —
  // ações de notificação (ler, apagar) são baixo risco pra desfazer visualmente se falhar.
  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });

  // Chamada só DEPOIS que a linha já encolheu na tela (ver NotificationRow): tira do cache sem
  // sobrar salto nenhum, porque o espaço que ela ocupava já foi embora antes. Se a chamada falhar,
  // devolve o item pro lugar (o snapshot de `onMutate`) e avisa.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list() });
      const previous = queryClient.getQueryData<NotificationsCache>(queryKeys.notifications.list());
      queryClient.setQueryData<NotificationsCache>(queryKeys.notifications.list(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
            total: Math.max(0, page.total - 1),
          })),
        };
      });
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications.list(), context.previous);
      Alert.alert('Ops!', getErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });

  function handlePress(item: AppNotification) {
    if (!item.isRead) readMutation.mutate(item.id);
    // Notificações agora vive fora das abas: pra abrir uma aba específica precisa navegar "através"
    // de `Main` (a rota que contém as abas), não direto pelo nome da aba.
    if (item.data?.action === 'OPEN_STOCK') {
      navigation.navigate('Main', { screen: 'EstoqueStack' });
    } else if (item.data?.action === 'OPEN_HOME') {
      navigation.navigate('Main', { screen: 'Home' });
    }
  }

  function renderEmpty() {
    if (list.status === 'idle' || list.status === 'loading') return <SkeletonRows Row={SaleRowSkeleton} />;
    if (list.status === 'error') {
      return <ErrorState message={list.error ?? 'Tente novamente.'} onRetry={() => void list.reload()} />;
    }
    return (
      <View className="flex-1 justify-center items-center">
        <Ionicons name="notifications-outline" size={40} color="#C7C9D9" />
        <Text className="text-sm font-semibold text-ink-500 mt-3">Nenhuma notificação por aqui</Text>
        <Text className="text-xs text-ink-400 mt-1">Você está em dia com sua loja</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        refreshing={list.refreshing}
        onRefresh={() => void list.refresh()}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<View className="flex-1 px-5">{renderEmpty()}</View>}
        ListFooterComponent={
          <View className="px-5">
            <ListFooter
              loading={list.loadingMore}
              error={list.items.length > 0 ? list.actionError : null}
              onRetry={() => void list.loadMore()}
            />
          </View>
        }
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
            <Pressable
              className="w-10 h-10 rounded-full bg-ink-50 items-center justify-center"
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
            >
              <Ionicons name="arrow-back" size={22} color="#1A1B25" />
            </Pressable>
            <Text className="text-lg font-extrabold text-ink-900 flex-1 text-center">Notificações</Text>
            <View className="w-10 h-10" />
          </View>
        }
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            onPress={handlePress}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      />
    </SafeAreaView>
  );
}
