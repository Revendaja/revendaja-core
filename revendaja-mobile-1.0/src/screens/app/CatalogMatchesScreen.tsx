import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ProductImage from '../../components/ProductImage';
import { listCatalogProducts } from '../../api/catalog';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { formatCurrency, hasSuggestedPrice } from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'CatalogMatches'>;

// Vinda da Nova venda: o que a pessoa buscou/escaneou não está na loja. Aqui ela escolhe qual produto
// do catálogo quer adicionar; o preço de venda é pedido na tela seguinte.
export default function CatalogMatchesScreen({ navigation, route }: Props) {
  const { term } = route.params;
  const guard = useStoreAccessGuard();
  const { inStoreProductIds } = useStoreProducts();

  const query = useQuery({
    queryKey: queryKeys.catalog.products({ search: `matches:${term}`, brandId: null }),
    queryFn: () => guard(() => listCatalogProducts({ search: term, pageSize: 20 })),
  });
  // Produtos que a loja já tem não precisam ser adicionados de novo.
  const items = (query.data?.items ?? []).filter((product) => !inStoreProductIds.has(product.id));

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between mb-2">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-lg font-extrabold text-ink-900">Adicionar à loja</Text>
          <View className="w-10 h-10" />
        </View>
        <Text className="text-xs text-ink-500 mb-4 text-center">
          Este produto não está na sua loja. Escolha qual do catálogo adicionar.
        </Text>

        {query.isPending ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#FF6B00" />
          </View>
        ) : query.isError ? (
          <Text className="text-sm text-danger text-center py-8">{getErrorMessage(query.error)}</Text>
        ) : items.length === 0 ? (
          <Text className="text-sm text-ink-400 text-center py-8">Nenhum produto do catálogo encontrado para "{term}".</Text>
        ) : (
          items.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => navigation.replace('QuickAddProduct', { catalogProduct: product })}
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${product.name} à minha loja`}
              className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5"
            >
              <ProductImage
                uri={product.productImageSm}
                resizeMode="cover"
                iconName="cube"
                iconSize={20}
                iconColor="#FF6B00"
                style={{ width: 52, height: 52, borderRadius: 12, marginRight: 12 }}
              />
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-bold text-primary-600 uppercase" numberOfLines={1}>
                  {product.brand.name}
                </Text>
                <Text className="text-sm font-bold text-ink-900" numberOfLines={2}>
                  {product.name}
                </Text>
                {hasSuggestedPrice(product.basePrice) && (
                  <Text className="text-xs text-ink-400 mt-0.5">Sugerido: {formatCurrency(product.basePrice)}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C7C9D9" />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
