import React, { memo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ProductImage from '../../components/ProductImage';
import { EmptyState, ErrorState, ListFooter } from '../../components/ListStates';
import { CatalogRowSkeleton, SkeletonRows } from '../../components/Skeleton';
import { CATALOG_PAGE_SIZE, listBrands, listCatalogProducts } from '../../api/catalog';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import type { CatalogProduct } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { formatCurrency, hasSuggestedPrice } from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'NewProduct'>;

const SEARCH_DEBOUNCE_MS = 400;

const CatalogRow = memo(function CatalogRow({
  product,
  inStore,
  onPress,
}: {
  product: CatalogProduct;
  inStore: boolean;
  onPress: (product: CatalogProduct, inStore: boolean) => void;
}) {
  return (
    <Pressable
      className="flex-row items-center bg-white rounded-2xl p-3 mb-3"
      style={{ elevation: 1 }}
      onPress={() => onPress(product, inStore)}
      accessibilityRole="button"
      accessibilityLabel={inStore ? `${product.name}, já está na sua loja` : product.name}
    >
      <ProductImage
        uri={product.productImageSm}
        resizeMode="cover"
        iconName="cube"
        iconSize={26}
        iconColor="#FF6B00"
        style={{ width: 56, height: 56, borderRadius: 12, marginRight: 12 }}
      />
      <View className="flex-1 pr-2">
        <Text className="text-[10px] font-bold text-primary-600 uppercase" numberOfLines={1}>
          {product.brand.name}
          {/* ~30% dos produtos têm basePrice = 0: nesse caso não mostramos "R$ 0,00". */}
          {hasSuggestedPrice(product.basePrice) && (
            <Text className="font-semibold text-ink-400 normal-case">{`  ·  ${formatCurrency(product.basePrice)}`}</Text>
          )}
        </Text>
        <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
          {product.name}
        </Text>
        {!!product.description && (
          <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
            {product.description}
          </Text>
        )}
      </View>
      {inStore ? (
        <View className="flex-row items-center bg-success-bg rounded-full px-2.5 py-1">
          <Ionicons name="checkmark" size={12} color="#1FAA59" />
          <Text className="text-success text-[10px] font-bold ml-1">Na loja</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#8B8FA3" />
      )}
    </Pressable>
  );
});

export default function NewProductScreen({ navigation }: Props) {
  const { items: storeItems, inStoreProductIds } = useStoreProducts();
  const [query, setQuery] = useState('');
  const [brandId, setBrandId] = useState<number | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  // Só busca depois que o usuário para de digitar. String vazia nunca vai para a API.
  const [debouncedQuery, commitQuery] = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const search = debouncedQuery.trim();
  // A busca da API aceita nome ou código de barras (8 a 14 dígitos).
  const isBarcodeSearch = /^\d{8,14}$/.test(search);

  // Marcas mudam raramente: `staleTime: Infinity` reaproveita o cache pro resto da sessão.
  const brandsQuery = useQuery({ queryKey: queryKeys.catalog.brands(), queryFn: listBrands, staleTime: Infinity });
  const brands = brandsQuery.data ?? [];
  const brandsError = brandsQuery.isError ? getErrorMessage(brandsQuery.error) : null;

  // Mudou a busca ou a marca: o TanStack Query já troca de cache sozinho pela chave (sem precisar
  // "descartar a lista" na mão) e ignora respostas de buscas antigas.
  const catalog = usePaginatedList<CatalogProduct>(
    (page, pageSize) => listCatalogProducts({ search, brandId, page, pageSize }),
    { pageSize: CATALOG_PAGE_SIZE, queryKey: queryKeys.catalog.products({ search, brandId }) }
  );

  // Código lido pela câmera: a leitura é intencional, então busca na hora (sem esperar o debounce da digitação).
  function handleScanned(code: string) {
    setScannerVisible(false);
    const value = code.trim();
    if (!value) return;
    setQuery(value);
    commitQuery(value);
  }

  function handlePressProduct(product: CatalogProduct, inStore: boolean) {
    if (!inStore) {
      navigation.navigate('ProductForm', { catalogProduct: product });
      return;
    }
    // Já está na loja: abre o produto da loja, se ele estiver entre os carregados.
    const existing = storeItems.find((item) => item.product.id === product.id);
    if (existing) navigation.navigate('ProductDetail', { storeProductId: existing.id });
    else Alert.alert('Já está na sua loja', 'Este produto já foi adicionado à sua loja.');
  }

  function renderEmpty() {
    if (catalog.status === 'idle' || catalog.status === 'loading') return <SkeletonRows Row={CatalogRowSkeleton} />;
    if (catalog.status === 'error') {
      return <ErrorState message={catalog.error ?? 'Tente novamente.'} onRetry={() => void catalog.reload()} />;
    }
    return (
      <EmptyState
        icon="search-outline"
        title="Nenhum produto encontrado"
        subtitle={
          isBarcodeSearch
            ? `Nenhum produto do catálogo tem o código de barras ${search}.`
            : 'Tente outro nome, um código de barras ou outra marca.'
        }
      />
    );
  }

  const chips: { id: number | null; name: string }[] = [{ id: null, name: 'Todas' }, ...brands];

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <View className="px-5 pt-3 pb-2">
        <View className="flex-row items-center gap-3 mb-4">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-xl font-extrabold text-ink-900">Novo Produto</Text>
        </View>

        <Pressable
          className="flex-row items-center bg-white rounded-2xl p-4 mb-5"
          style={{ elevation: 1 }}
          onPress={() => navigation.navigate('ManualProductForm', undefined)}
          accessibilityRole="button"
        >
          <View className="w-10 h-10 rounded-xl bg-primary-50 items-center justify-center mr-3">
            <Ionicons name="create-outline" size={20} color="#FF6B00" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-extrabold text-ink-900">Cadastro Manual</Text>
            <Text className="text-xs text-ink-400 mt-0.5">
              Crie um produto próprio (ex.: um ursinho ou uma cesta de presente)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8B8FA3" />
        </Pressable>

        <View className="flex-row items-end justify-between mb-2">
          <Text className="text-sm font-extrabold text-ink-900">Escolha do catálogo</Text>
          {catalog.status === 'ready' && (
            <Text className="text-xs text-ink-400">{catalog.total.toLocaleString('pt-BR')} produtos</Text>
          )}
        </View>

        <View className="flex-row items-center gap-2 mb-3">
          <View className="flex-1 flex-row items-center bg-white rounded-xl px-3 h-11 gap-2">
            <Ionicons name="search" size={18} color="#8B8FA3" />
            <TextInput
              placeholder="Buscar por nome ou código de barras..."
              placeholderTextColor="#8B8FA3"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Buscar por nome ou código de barras"
              className="flex-1 text-sm text-ink-900"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={18} color="#C7C9D9" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setScannerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Escanear código de barras"
            className="w-11 h-11 rounded-xl bg-primary-500 items-center justify-center"
          >
            <Ionicons name="barcode-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        {brandsError ? (
          <Pressable onPress={() => void brandsQuery.refetch()} accessibilityRole="button">
            <Text className="text-xs text-ink-400">
              Não foi possível carregar as marcas. <Text className="font-bold text-primary-500">Tentar novamente</Text>
            </Text>
          </Pressable>
        ) : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={chips}
            keyExtractor={(chip) => String(chip.id)}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: chip }) => {
              const active = chip.id === brandId;
              return (
                <Pressable
                  onPress={() => setBrandId(chip.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`px-3.5 py-2 rounded-full ${active ? 'bg-primary-500' : 'bg-white'}`}
                >
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-ink-500'}`}>{chip.name}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      <FlatList
        data={catalog.items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20, paddingTop: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={catalog.refreshing}
        onRefresh={() => void catalog.refresh()}
        onEndReached={() => void catalog.loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          <ListFooter
            loading={catalog.loadingMore}
            error={catalog.items.length > 0 ? catalog.actionError : null}
            onRetry={() => void catalog.loadMore()}
          />
        }
        renderItem={({ item }) => (
          <CatalogRow product={item} inStore={inStoreProductIds.has(item.id)} onPress={handlePressProduct} />
        )}
      />

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
      />
    </SafeAreaView>
  );
}
