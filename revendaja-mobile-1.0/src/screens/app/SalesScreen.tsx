import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ErrorState, ListFooter } from '../../components/ListStates';
import { SaleRowSkeleton, SkeletonRows } from '../../components/Skeleton';
import { getSalesSummary, listSales, SALES_PAGE_SIZE } from '../../api/sales';
import { queryKeys } from '../../api/queryKeys';
import type { SaleListItem, SaleStatusValue } from '../../api/types';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { formatCurrency } from '../../utils/format';
import {
  formatDateShort,
  formatDayLabel,
  groupSalesByDay,
  MONTHS,
  PAYMENT_ICON,
  paymentLabel,
  periodRange,
  STATUS_LABEL,
} from '../../utils/sales';
import type { Period } from '../../utils/sales';
import type { FinancasStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FinancasStackParamList, 'SalesList'>;
type StatusFilter = SaleStatusValue | 'all';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'paid', label: 'Pago' },
  { key: 'pending', label: 'Pendente' },
  { key: 'cancelled', label: 'Cancelado' },
];

const STATUS_TEXT_COLOR: Record<SaleStatusValue, string> = {
  paid: 'text-success',
  pending: 'text-warning',
  cancelled: 'text-ink-400',
};

export default function SalesScreen({ navigation }: Props) {
  const guard = useStoreAccessGuard();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [period, setPeriod] = useState<Period>('month');
  // "Hoje" só muda ao voltar para a tela: mantém os limites do período estáveis entre renders.
  const [today, setToday] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());

  const monthScrollRef = useRef<ScrollView>(null);
  const monthLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const monthScrollWidth = useRef(0);
  const didAutoScrollMonth = useRef(false);

  const scrollToMonth = useCallback((index: number, animated: boolean) => {
    const layout = monthLayouts.current[index];
    if (!layout || !monthScrollWidth.current) return;
    const x = Math.max(0, layout.x - monthScrollWidth.current / 2 + layout.width / 2);
    monthScrollRef.current?.scrollTo({ x, animated });
  }, []);

  const maybeAutoScrollMonth = useCallback(() => {
    if (didAutoScrollMonth.current) return;
    if (!monthScrollWidth.current) return;
    if (Object.keys(monthLayouts.current).length < MONTHS.length) return;
    didAutoScrollMonth.current = true;
    scrollToMonth(selectedMonth, false);
  }, [scrollToMonth, selectedMonth]);

  useEffect(() => {
    if (period === 'month') {
      didAutoScrollMonth.current = false;
      maybeAutoScrollMonth();
    }
  }, [period, maybeAutoScrollMonth]);

  useFocusEffect(
    useCallback(() => {
      setToday(new Date());
    }, [])
  );

  // Limites do período no fuso do aparelho: `from` inclusivo, `to` exclusivo (ISO-8601).
  const range = useMemo(() => periodRange(period, selectedMonth, today), [period, selectedMonth, today]);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  // O mês atual sem filtro (a visão padrão ao abrir a tela) já vem prefetchado em background, junto
  // com Início e Estoque (ver RootNavigator): a query nasce com o cache pronto, sem skeleton, porque
  // usa a MESMA chave do prefetch. Revalida sozinha ao ganhar foco (useRefetchOnFocus) e depois de
  // uma venda nova (a mutação de criar venda invalida `sales` e `home`).
  const listParams = { from: fromIso, to: toIso, status: filter === 'all' ? undefined : filter };
  const list = usePaginatedList<SaleListItem>(
    (page, pageSize) => guard(() => listSales({ ...listParams, page, pageSize })),
    { pageSize: SALES_PAGE_SIZE, queryKey: queryKeys.sales.list(listParams) }
  );

  // Resumo do período (faturamento, a receber, lucro e margem): vem pronto do servidor.
  const summaryQuery = useQuery({
    queryKey: queryKeys.sales.summary({ from: fromIso, to: toIso }),
    queryFn: () => guard(() => getSalesSummary({ from: fromIso, to: toIso })),
  });
  const summary = summaryQuery.data ?? null;
  const summaryStatus: 'loading' | 'ready' | 'error' = summaryQuery.isPending
    ? 'loading'
    : summaryQuery.isError
      ? 'error'
      : 'ready';

  useRefetchOnFocus(queryKeys.sales.all());

  const sections = useMemo(
    () =>
      groupSalesByDay(list.items).map((section) => ({
        title: formatDayLabel(section.key, today),
        total: section.total,
        data: section.data,
      })),
    [list.items, today]
  );

  function handleRefresh() {
    void summaryQuery.refetch();
    void list.refresh();
  }

  const hasProfit = summary !== null && summary.profit !== null && summary.marginPercent !== null;
  const isCashPositive = hasProfit && (summary?.profit ?? 0) >= 0;

  function renderEmpty() {
    if (list.status === 'idle' || list.status === 'loading') return <SkeletonRows Row={SaleRowSkeleton} />;
    if (list.status === 'error') {
      return <ErrorState message={list.error ?? 'Tente novamente.'} onRetry={() => void list.reload()} />;
    }
    return <Text className="text-center text-ink-500 mt-10">Nenhuma venda encontrada.</Text>;
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 20, paddingTop: 12, flexGrow: 1 }}
        refreshing={list.refreshing}
        onRefresh={handleRefresh}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          <ListFooter
            loading={list.loadingMore}
            error={list.items.length > 0 ? list.actionError : null}
            onRetry={() => void list.loadMore()}
          />
        }
        ListHeaderComponent={
          <View>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-2xl font-extrabold text-ink-900">Finanças</Text>
              <Pressable
                onPress={() => navigation.navigate('Reports')}
                accessibilityRole="button"
                accessibilityLabel="Ver relatórios"
                className="flex-row items-center gap-1.5 bg-primary-500 rounded-full pl-3 pr-4 py-2.5"
              >
                <Ionicons name="stats-chart-outline" size={16} color="#fff" />
                <Text className="text-white text-xs font-bold">Relatórios</Text>
              </Pressable>
            </View>

            <View className="flex-row bg-ink-100 rounded-xl p-1.5 mb-4" style={{ gap: 6 }}>
              {(['month', 'week', 'year'] as const).map((key) => {
                const active = key === period;
                const label = key === 'month' ? MONTHS[selectedMonth] : key === 'week' ? 'Últimos 7 dias' : `Ano ${today.getFullYear()}`;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setPeriod(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 items-center justify-center rounded-lg ${active ? 'bg-primary-500' : ''}`}
                    style={[
                      { height: 40 },
                      active
                        ? {
                            elevation: 3,
                            shadowColor: '#FF6B00',
                            shadowOpacity: 0.3,
                            shadowRadius: 5,
                            shadowOffset: { width: 0, height: 2 },
                          }
                        : undefined,
                    ]}
                  >
                    <Text
                      className={`text-[11px] font-extrabold text-center ${active ? 'text-white' : 'text-ink-500'}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {period === 'month' && (
              <ScrollView
                ref={monthScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                className="mb-4"
                onLayout={(e) => {
                  monthScrollWidth.current = e.nativeEvent.layout.width;
                  maybeAutoScrollMonth();
                }}
              >
                {MONTHS.map((label, index) => {
                  const active = index === selectedMonth;
                  return (
                    <Pressable
                      key={label}
                      onLayout={(e) => {
                        const { x, width } = e.nativeEvent.layout;
                        monthLayouts.current[index] = { x, width };
                        maybeAutoScrollMonth();
                      }}
                      onPress={() => setSelectedMonth(index)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={`px-3.5 py-2 rounded-full ${active ? 'bg-primary-500' : 'bg-white'}`}
                    >
                      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-ink-500'}`}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center">
                  <Ionicons name="business-outline" size={18} color="#FF6B00" />
                </View>
                <Text className="text-sm text-ink-500">Faturamento Total Bruto</Text>
              </View>

              {summaryStatus === 'error' && !summary ? (
                <Pressable onPress={() => void summaryQuery.refetch()} accessibilityRole="button">
                  <Text className="text-sm text-ink-400">
                    Não foi possível carregar o resumo. <Text className="font-bold text-primary-500">Tentar novamente</Text>
                  </Text>
                </Pressable>
              ) : (
                <View style={{ opacity: summaryStatus === 'loading' ? 0.5 : 1 }}>
                  <View className="flex-row items-end gap-2">
                    <Text className="text-3xl font-extrabold text-ink-900">
                      {summary ? formatCurrency(summary.grossRevenue) : '—'}
                    </Text>
                    {hasProfit && (
                      <Text className={`text-xs font-bold mb-1 ${isCashPositive ? 'text-success' : 'text-danger'}`}>
                        {isCashPositive ? 'Caixa Positivo' : 'Caixa Negativo'}
                      </Text>
                    )}
                  </View>

                  <View className="flex-row items-center justify-between mt-1.5">
                    {summary && summary.profit !== null && summary.marginPercent !== null ? (
                      <Text className="text-success text-sm font-semibold">
                        Lucro: {formatCurrency(summary.profit)} ({Math.round(summary.marginPercent)}%)
                      </Text>
                    ) : (
                      <Text className="text-ink-400 text-xs flex-shrink pr-2">
                        Lucro: informe o preço de custo dos produtos
                      </Text>
                    )}
                    <Text className="text-warning text-sm font-semibold">
                      A receber: {formatCurrency(summary?.pendingTotal ?? 0)}
                    </Text>
                  </View>

                  {summary?.profitIsPartial && summary.profit !== null && (
                    <Text className="text-[11px] text-ink-400 mt-1.5">
                      O lucro considera só os produtos com preço de custo informado.
                    </Text>
                  )}
                </View>
              )}
            </View>

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-extrabold text-ink-900">Transações</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
            >
              {FILTERS.map(({ key, label }) => {
                const active = key === filter;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setFilter(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`px-3.5 py-2 rounded-full ${active ? 'bg-primary-500' : 'bg-white'}`}
                  >
                    <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-ink-500'}`}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center justify-between mb-2 mt-3">
            <Text className="text-xs font-extrabold text-ink-500 uppercase">{section.title}</Text>
            <Text className="text-xs font-extrabold text-ink-900">{formatCurrency(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const amountColor = STATUS_TEXT_COLOR[item.status];

          return (
            <Pressable
              className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5"
              onPress={() => navigation.navigate('SaleDetail', { saleId: item.id })}
              accessibilityRole="button"
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center mr-3 bg-primary-50">
                <Ionicons name={PAYMENT_ICON[item.paymentMethod]} size={20} color="#FF6B00" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
                  {item.customerName}
                </Text>
                <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
                  {paymentLabel(item.paymentMethod, item.installments)} • {formatDateShort(item.createdAt)}
                </Text>
              </View>
              <View className="items-end">
                <Text className={`text-sm font-extrabold ${amountColor}`}>
                  {item.status === 'paid' ? '+' : ''}
                  {formatCurrency(item.total)}
                </Text>
                <Text className={`text-[11px] font-semibold mt-0.5 ${amountColor}`}>{STATUS_LABEL[item.status]}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
