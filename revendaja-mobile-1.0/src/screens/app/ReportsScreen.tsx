import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ProductImage from '../../components/ProductImage';
import { ErrorState } from '../../components/ListStates';
import { ReportRowSkeleton, SkeletonRows } from '../../components/Skeleton';
import { getStaleProducts, getTopProducts } from '../../api/sales';
import { queryKeys } from '../../api/queryKeys';
import type { StaleProduct, TopProduct } from '../../api/types';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { formatCurrency } from '../../utils/format';
import type { FinancasStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FinancasStackParamList, 'Reports'>;

// Janela fixa de 30 dias na v1 (sem seletor de período): mantém a tela simples de olhar rápido.
const WINDOW_DAYS = 30;

function TopProductRow({ rank, item }: { rank: number; item: TopProduct }) {
  return (
    <View className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
      <View className="w-6 items-center mr-2">
        <Text className="text-xs font-extrabold text-ink-400">{rank}º</Text>
      </View>
      <ProductImage
        uri={item.image}
        resizeMode="cover"
        iconName="cube"
        style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }}
      />
      <View className="flex-1 pr-2">
        <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-xs text-ink-400 mt-0.5">
          {item.quantitySold === 1 ? '1 unidade vendida' : `${item.quantitySold} unidades vendidas`}
        </Text>
      </View>
      <Text className="text-sm font-extrabold text-success">{formatCurrency(item.revenue)}</Text>
    </View>
  );
}

function StaleProductRow({ item }: { item: StaleProduct }) {
  const lastSoldLabel = item.lastSoldAt
    ? `Última venda ${new Date(item.lastSoldAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
    : 'Nunca vendido';

  return (
    <View className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
      <ProductImage
        uri={item.image}
        resizeMode="cover"
        iconName="cube"
        style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }}
      />
      <View className="flex-1 pr-2">
        <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
          {item.name}
        </Text>
        <Text className="text-xs text-warning mt-0.5">{lastSoldLabel}</Text>
      </View>
      <View className="items-end">
        <Text className="text-sm font-extrabold text-ink-900">{formatCurrency(item.price)}</Text>
        <Text className="text-[11px] text-ink-400 mt-0.5">{item.stock} em estoque</Text>
      </View>
    </View>
  );
}

export default function ReportsScreen({ navigation }: Props) {
  const guard = useStoreAccessGuard();

  const { from, to } = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000), to: now };
  }, []);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const topProductsParams = { from: fromIso, to: toIso, limit: 10 };
  const topProductsQuery = useQuery({
    queryKey: queryKeys.sales.topProducts(topProductsParams),
    queryFn: () => guard(() => getTopProducts(topProductsParams)),
  });

  const staleProductsParams = { days: WINDOW_DAYS, limit: 20 };
  const staleProductsQuery = useQuery({
    queryKey: queryKeys.sales.staleProducts(staleProductsParams),
    queryFn: () => guard(() => getStaleProducts(staleProductsParams)),
  });

  const topProducts = topProductsQuery.data?.items ?? [];
  const staleProducts = staleProductsQuery.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
        <Pressable
          className="w-10 h-10 rounded-full bg-white items-center justify-center"
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="arrow-back" size={22} color="#1A1B25" />
        </Pressable>
        <Text className="text-lg font-extrabold text-ink-900">Relatórios</Text>
        <View className="w-10 h-10" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}>
        <Text className="text-xs text-ink-400 mb-4">Últimos {WINDOW_DAYS} dias</Text>

        <Text className="text-sm font-extrabold text-ink-900 mb-3">Mais vendidos</Text>
        {topProductsQuery.isPending ? (
          <SkeletonRows Row={ReportRowSkeleton} count={3} />
        ) : topProductsQuery.isError ? (
          <ErrorState message="Não foi possível carregar os mais vendidos." onRetry={() => void topProductsQuery.refetch()} />
        ) : topProducts.length === 0 ? (
          <View className="bg-white rounded-2xl p-4 items-center mb-2">
            <Text className="text-xs text-ink-400">Nenhuma venda paga nos últimos {WINDOW_DAYS} dias.</Text>
          </View>
        ) : (
          topProducts.map((item, index) => <TopProductRow key={item.storeProductId} rank={index + 1} item={item} />)
        )}

        <Text className="text-sm font-extrabold text-ink-900 mb-3 mt-6">Parados</Text>
        <Text className="text-xs text-ink-400 mb-3">
          Produtos com estoque que não venderam nos últimos {WINDOW_DAYS} dias — candidatos a uma promoção.
        </Text>
        {staleProductsQuery.isPending ? (
          <SkeletonRows Row={ReportRowSkeleton} count={3} />
        ) : staleProductsQuery.isError ? (
          <ErrorState message="Não foi possível carregar os produtos parados." onRetry={() => void staleProductsQuery.refetch()} />
        ) : staleProducts.length === 0 ? (
          <View className="bg-white rounded-2xl p-4 items-center">
            <Text className="text-xs text-ink-400">Nenhum produto parado — tudo girando bem!</Text>
          </View>
        ) : (
          staleProducts.map((item) => <StaleProductRow key={item.storeProductId} item={item} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
