import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import GoalPickerModal from '../../components/GoalPickerModal';
import { ErrorState } from '../../components/ListStates';
import { HomeSkeleton } from '../../components/Skeleton';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage } from '../../api/errors';
import { getHome } from '../../api/home';
import { queryKeys } from '../../api/queryKeys';
import { setMonthlyGoal } from '../../api/stores';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';
import { MONTH_NAMES } from '../../utils/sales';
import type { HomeStackParamList, RootStackParamList, RootTabParamList } from '../../navigation/types';

// 3 níveis: a própria stack da aba Início + as abas + a pilha raiz — precisa da raiz pra
// `navigation.navigate('Notifications')` (fora das abas de propósito, ver navigation/types.ts).
type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeHome'>,
  CompositeScreenProps<BottomTabScreenProps<RootTabParamList>, NativeStackScreenProps<RootStackParamList>>
>;

type HomeAlert = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const guard = useStoreAccessGuard();
  const queryClient = useQueryClient();
  // Já vem prefetchado (RootNavigator): abre sem skeleton. Ao ganhar foco de novo (voltar de
  // Estoque, de uma venda...) só atualiza em silêncio, mantendo os números já na tela.
  const homeQuery = useQuery({ queryKey: queryKeys.home(), queryFn: () => guard(() => getHome(new Date())) });
  useRefetchOnFocus(queryKeys.home());

  const data = homeQuery.data ?? null;
  const status: 'loading' | 'ready' | 'error' = homeQuery.isPending ? 'loading' : homeQuery.isError ? 'error' : 'ready';
  const error = homeQuery.isError ? getErrorMessage(homeQuery.error) : null;

  // Só true quando a própria pessoa puxou a tela pra atualizar: a revalidação silenciosa em segundo
  // plano (useRefetchOnFocus) também deixa `homeQuery.isRefetching` true, mas não deve acender esse
  // indicador — senão pisca toda vez que a Início ganha foco de novo.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  async function handlePullToRefresh() {
    setManualRefreshing(true);
    try {
      await homeQuery.refetch();
    } finally {
      setManualRefreshing(false);
    }
  }

  const saveGoalMutation = useMutation({
    mutationFn: (goal: number) => guard(() => setMonthlyGoal(goal)),
    // Espera a Início refazer a busca antes de resolver: o seletor só fecha quando a meta nova já
    // está na tela (mesmo efeito de antes, que buscava a Início de novo dentro do próprio saveGoal).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.home() }),
  });

  const [showRevenue, setShowRevenue] = useState(true);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);

  const firstName = user?.name.trim().split(/\s+/)[0] ?? '';
  const monthName = MONTH_NAMES[new Date().getMonth()];

  // A meta é escolhida no início: sem meta, o seletor abre e só fecha quando o usuário escolhe uma.
  const mustPickGoal = status === 'ready' && data?.goal === null;

  async function handleSaveGoal(goal: number) {
    await saveGoalMutation.mutateAsync(goal);
    setGoalPickerOpen(false);
  }

  const alerts: HomeAlert[] = [];
  if (data) {
    const { lowStock, pendingSales } = data.alerts;
    if (lowStock.count > 0) {
      alerts.push({
        key: 'stock',
        icon: 'bag-remove-outline',
        title: `${lowStock.count} ${lowStock.count === 1 ? 'produto em baixa' : 'produtos em baixa'}`,
        subtitle: lowStock.products.map((p) => p.name).join(', '),
        onPress: () => navigation.navigate('EstoqueStack'),
      });
    }
    if (pendingSales.count > 0) {
      alerts.push({
        key: 'pending',
        icon: 'time-outline',
        title: `${pendingSales.count} ${pendingSales.count === 1 ? 'venda pendente' : 'vendas pendentes'}`,
        subtitle: 'Aguardando confirmação de pagamento',
        onPress: () => navigation.navigate('FinancasStack'),
      });
    }
  }

  const quickActions = [
    {
      key: 'sale',
      title: 'Nova Venda',
      subtitle: 'Registrar pedido',
      icon: 'storefront-outline' as const,
      onPress: () => navigation.navigate('NovaVenda'),
    },
    {
      key: 'product',
      title: 'Novo Produto',
      subtitle: 'Cadastrar estoque',
      icon: 'add-circle-outline' as const,
      onPress: () => navigation.navigate('EstoqueStack'),
    },
    {
      key: 'onlineSales',
      title: 'Vendas Online',
      subtitle: 'Pedidos pela vitrine',
      icon: 'receipt-outline' as const,
      onPress: () => navigation.navigate('MoreStack', { screen: 'OnlineSales' }),
    },
    {
      key: 'storeLink',
      title: 'Link da minha loja',
      subtitle: 'Compartilhe com clientes',
      icon: 'link-outline' as const,
      onPress: () => navigation.navigate('MoreStack', { screen: 'StoreHome' }),
    },
  ];

  const growth = data?.revenue.growthPercent ?? null;
  const growthRounded = growth === null ? 0 : Math.round(Math.abs(growth));

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={() => void handlePullToRefresh()}
            tintColor="#FF6B00"
            colors={['#FF6B00']}
          />
        }
      >
        <View className="flex-row items-center justify-between mb-5">
          <View className="flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full bg-primary-500 items-center justify-center">
              <Text className="text-white font-bold">{firstName.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text
                className={`font-extrabold text-ink-900 ${Platform.OS === 'android' ? 'text-sm' : 'text-base'}`}
              >
                {firstName ? `Olá, ${firstName}` : 'Olá'}
              </Text>
              {data && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Ionicons name="medal" size={12} color="#FF6B00" />
                  <Text
                    className={`font-bold text-primary-600 ${Platform.OS === 'android' ? 'text-[10px]' : 'text-xs'}`}
                  >
                    {data.plan.name}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel="Notificações"
          >
            <Ionicons name="notifications-outline" size={20} color="#1A1B25" />
            {alerts.length > 0 && <View className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-500" />}
          </Pressable>
        </View>

        {status === 'loading' && <HomeSkeleton />}
        {status === 'error' && <ErrorState message={error ?? 'Tente novamente.'} onRetry={() => void homeQuery.refetch()} />}

        {data && status === 'ready' && (
          <>
            <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center">
                    <Ionicons name="wallet-outline" size={18} color="#FF6B00" />
                  </View>
                  <Text className={`text-ink-500 ${Platform.OS === 'android' ? 'text-xs' : 'text-sm'}`}>
                    Faturamento em {monthName}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowRevenue((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showRevenue ? 'Ocultar valores' : 'Mostrar valores'}
                >
                  <Ionicons name={showRevenue ? 'eye-outline' : 'eye-off-outline'} size={20} color="#8A8D9F" />
                </Pressable>
              </View>

              <View className="flex-row items-end gap-2">
                <Text className="text-3xl font-extrabold text-ink-900">
                  {showRevenue ? formatCurrency(data.revenue.total) : 'R$ ••••••'}
                </Text>
                {showRevenue && growth !== null && growthRounded > 0 && (
                  <Text className={`text-xs font-bold mb-1 ${growth >= 0 ? 'text-success' : 'text-danger'}`}>
                    {growth >= 0 ? '↑' : '↓'} {growthRounded}%
                  </Text>
                )}
              </View>

              <View className="flex-row items-center justify-between mt-1.5">
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  className={`text-ink-400 flex-shrink pr-2 ${Platform.OS === 'android' ? 'text-[10px]' : 'text-[11px]'}`}
                >
                  {Platform.OS === 'android' ? 'Só as vendas já recebidas' : 'Considera só as vendas já recebidas'}
                </Text>
                <Pressable
                  className="flex-row items-center gap-1"
                  onPress={() => navigation.navigate('FinancasStack')}
                  accessibilityRole="button"
                >
                  <Text
                    className={`text-primary-600 font-bold ${Platform.OS === 'android' ? 'text-[10px]' : 'text-xs'}`}
                  >
                    Ver extrato
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#FF6B00" />
                </Pressable>
              </View>
            </View>

            {data.goal && (
              <Pressable
                onPress={() => setGoalPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Alterar meta de vendas"
                className="bg-white rounded-2xl p-4 mb-4"
                style={{ elevation: 1 }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="flag" size={14} color="#FF6B00" />
                    <Text className={`text-ink-500 ${Platform.OS === 'android' ? 'text-xs' : 'text-sm'}`}>
                      Meta de Vendas
                    </Text>
                    <Ionicons name="create-outline" size={14} color="#8A8D9F" />
                  </View>
                  <Text
                    className={`font-bold text-primary-600 ${Platform.OS === 'android' ? 'text-xs' : 'text-sm'}`}
                  >
                    {Math.floor(data.goal.percent)}%
                  </Text>
                </View>

                <View className="h-2 rounded-full bg-ink-100 overflow-hidden">
                  <View className="h-2 rounded-full bg-primary-500" style={{ width: `${data.goal.percent}%` }} />
                </View>

                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  className={`text-ink-400 mt-2 ${Platform.OS === 'android' ? 'text-[10px]' : 'text-xs'}`}
                >
                  {data.goal.remaining > 0
                    ? `Faltam ${formatCurrency(data.goal.remaining)} para a meta de ${formatCurrencyWhole(data.goal.target)}`
                    : `Meta de ${formatCurrencyWhole(data.goal.target)} batida! Parabéns.`}
                </Text>
              </Pressable>
            )}
          </>
        )}

        <View className="flex-row items-center justify-between mb-3">
          <Text className={`font-extrabold text-ink-900 ${Platform.OS === 'android' ? 'text-sm' : 'text-lg'}`}>
            Ações Rápidas
          </Text>
          <Text className="text-xs text-ink-400">Toque para iniciar</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 8 }}
          className="mb-4"
        >
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              style={{ width: 150 }}
              className="rounded-2xl p-4 bg-white"
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mb-3 bg-primary-50">
                <Ionicons name={action.icon} size={20} color="#FF6B00" />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                className={`font-extrabold text-ink-900 ${Platform.OS === 'android' ? 'text-xs' : 'text-sm'}`}
              >
                {action.title}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                className={`mt-0.5 text-ink-400 ${Platform.OS === 'android' ? 'text-[10px]' : 'text-xs'}`}
              >
                {action.subtitle}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {alerts.length > 0 && (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <Text className={`font-extrabold text-ink-900 ${Platform.OS === 'android' ? 'text-sm' : 'text-lg'}`}>
                Atenção Necessária
              </Text>
              <View className="bg-primary-50 rounded-full px-2.5 py-1">
                <Text className="text-primary-600 text-xs font-bold">
                  {alerts.length} {alerts.length === 1 ? 'aviso' : 'avisos'}
                </Text>
              </View>
            </View>

            {alerts.map((alert) => (
              <Pressable
                key={alert.key}
                onPress={alert.onPress}
                className="flex-row items-center bg-white rounded-2xl p-4 mb-3"
                style={{ elevation: 1 }}
              >
                <View className="w-10 h-10 rounded-xl items-center justify-center mr-3 bg-primary-50">
                  <Ionicons name={alert.icon} size={20} color="#FF6B00" />
                </View>
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-ink-900">{alert.title}</Text>
                  <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
                    {alert.subtitle}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <GoalPickerModal
        visible={mustPickGoal || goalPickerOpen}
        dismissible={!mustPickGoal}
        currentGoal={data?.goal?.target ?? null}
        onSave={handleSaveGoal}
        onClose={() => setGoalPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
