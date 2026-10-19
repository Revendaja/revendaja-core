import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import OptionsSheetModal from '../../components/OptionsSheetModal';
import type { SheetOption } from '../../components/OptionsSheetModal';
import ProductImage from '../../components/ProductImage';
import { EmptyState, ErrorState, ListFooter } from '../../components/ListStates';
import { ProductCardSkeleton, SkeletonRows } from '../../components/Skeleton';
import { getErrorMessage, isApiError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { listStoreCategories } from '../../api/storeCategories';
import { listStoreProducts, STORE_PRODUCTS_PAGE_SIZE } from '../../api/storeProducts';
import type { StoreProductSort } from '../../api/storeProducts';
import type { StoreProduct } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useStockStepper } from '../../hooks/useStockStepper';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { formatCurrency, hasSuggestedPrice, STOCK_MAX } from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'CatalogList'>;

type StatusFilter = 'all' | 'active' | 'hidden';

const LOW_STOCK_THRESHOLD = 20;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Visíveis' },
  { key: 'hidden', label: 'Ocultos' },
];

const SORT_OPTIONS: (SheetOption & { key: StoreProductSort })[] = [
  { key: 'recent', label: 'Mais recentes' },
  { key: 'name_asc', label: 'Nome (A-Z)' },
  { key: 'name_desc', label: 'Nome (Z-A)' },
  { key: 'price_asc', label: 'Menor preço' },
  { key: 'price_desc', label: 'Maior preço' },
  { key: 'stock_asc', label: 'Menor estoque' },
];
const SORT_LABEL = new Map(SORT_OPTIONS.map((option) => [option.key, option.label]));
const NO_CATEGORY_KEY = 'all';

// Card idêntico ao da UI original (mock). O que a API não tem (custo, lucro) ganha o dado equivalente do catálogo:
// "Custo" → preço sugerido, "% MARGEM" → rentabilidade da marca (informativa, sem cálculo). O estoque vem da
// API (StoreProduct.stock): 0 = Esgotado, até 20 = Estoque Baixo (como no mock). Os botões − / + do card alteram
// o estoque de verdade (PATCH com o total), e o texto de estoque ao lado acompanha o mesmo valor.
function ProductCard({
  item,
  onPress,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: StoreProduct;
  onPress: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { update, refresh } = useStoreProducts();
  const { product } = item;
  const stepper = useStockStepper({
    current: item.stock,
    save: (value) => update(item.id, { stock: value }),
    onError: (error) => {
      // 404: o produto já não existe mais na loja; atualiza a lista.
      if (isApiError(error) && error.status === 404) void refresh();
      Alert.alert('Ops!', getErrorMessage(error));
    },
  });
  const stock = stepper.value;
  const isOutOfStock = stock === 0;
  const isLowStock = stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  const suggested = hasSuggestedPrice(product.basePrice);

  return (
    <Pressable
      onPress={selectionMode ? onToggleSelect : onPress}
      className="bg-white rounded-2xl p-3 mb-3"
      style={{ elevation: 1, opacity: item.isActive && !item.isFrozen ? 1 : 0.6 }}
    >
      <View className="flex-row">
        {selectionMode && (
          <View className="justify-center pr-2.5" accessibilityLabel={selected ? 'Selecionado' : 'Não selecionado'}>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={selected ? '#FF6B00' : '#C7C9D9'}
            />
          </View>
        )}
        <View className="w-20 h-20 rounded-xl bg-ink-50 items-center justify-center overflow-hidden">
          <View className="absolute top-1.5 left-1.5 bg-white rounded-md px-1.5 py-0.5 z-10" style={{ elevation: 1, maxWidth: 68 }}>
            <Text className="text-[9px] font-bold text-ink-700" numberOfLines={1}>
              {product.brand.name}
            </Text>
          </View>
          {item.isPromoActive && (
            <View className="absolute top-1.5 right-1.5 bg-danger rounded-md px-1.5 py-0.5 z-10" style={{ elevation: 1 }}>
              <Text className="text-[9px] font-bold text-white">PROMO</Text>
            </View>
          )}
          <ProductImage
            uri={product.productImageSm}
            resizeMode="cover"
            iconName="cube"
            iconSize={30}
            iconColor="#FF6B00"
            style={{ width: '100%', height: '100%' }}
          />
        </View>

        <View className="flex-1 pl-3">
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 text-sm font-bold text-ink-900 pr-2" numberOfLines={1}>
              {product.name}
            </Text>
            <Ionicons name="ellipsis-vertical" size={16} color="#8B8FA3" />
          </View>

          <View className="flex-row items-center justify-between mt-2">
            <Text
              className={`flex-shrink text-xs text-ink-400 ${suggested ? 'line-through' : ''}`}
              numberOfLines={1}
            >
              {suggested ? `Sugerido: ${formatCurrency(product.basePrice)}` : 'Sem preço sugerido'}
            </Text>
            {product.brand.profitability > 0 && (
              <View className="bg-success-bg rounded-full px-2 py-0.5 ml-2">
                <Text className="text-success text-[10px] font-bold">{product.brand.profitability}% RENTABILIDADE</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center justify-between mt-1">
            {item.isPromoActive && item.promoPrice !== null ? (
              <View className="flex-row items-center gap-1.5 flex-shrink">
                <Text className="text-lg font-extrabold text-danger">{formatCurrency(item.promoPrice)}</Text>
                <Text className="text-xs text-ink-400 line-through">{formatCurrency(item.price)}</Text>
              </View>
            ) : (
              <Text className="text-lg font-extrabold text-ink-900">{formatCurrency(item.price)}</Text>
            )}
            {item.isFrozen ? (
              <Text className="text-danger text-xs font-semibold">Congelado</Text>
            ) : (
              !item.isActive && <Text className="text-warning text-xs font-semibold">Oculto na vitrine</Text>
            )}
          </View>
        </View>
      </View>

      <View className="h-px bg-ink-100 my-3" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons
            name={isOutOfStock ? 'close-circle' : isLowStock ? 'alert-circle' : 'checkmark-circle'}
            size={16}
            color={isOutOfStock ? '#E0453F' : isLowStock ? '#E0952B' : '#1FAA59'}
          />
          {isOutOfStock ? (
            <Text className="text-xs font-bold text-danger">Esgotado</Text>
          ) : (
            <Text className="text-xs text-ink-700">
              <Text className={`font-bold ${isLowStock ? 'text-warning' : 'text-success'}`}>
                {isLowStock ? 'Estoque Baixo' : 'Estoque Seguro'}:
              </Text>{' '}
              {stock} un
            </Text>
          )}
        </View>

        <View className="flex-row items-center bg-ink-50 rounded-full">
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              stepper.decrement();
            }}
            disabled={stock <= 0}
            accessibilityRole="button"
            accessibilityLabel="Diminuir estoque"
            className="w-8 h-8 items-center justify-center"
            style={{ opacity: stock <= 0 ? 0.4 : 1 }}
          >
            <Ionicons name="remove" size={16} color="#3A3D4D" />
          </Pressable>
          <Text
            className="text-sm font-bold text-ink-900 text-center"
            style={{ minWidth: 24, paddingHorizontal: 2, opacity: stepper.saving ? 0.6 : 1 }}
            accessibilityLabel={`Estoque: ${stock}`}
          >
            {stock}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              stepper.increment();
            }}
            disabled={stock >= STOCK_MAX}
            accessibilityRole="button"
            accessibilityLabel="Aumentar estoque"
            className="w-8 h-8 rounded-full bg-primary-500 items-center justify-center"
            style={{ opacity: stock >= STOCK_MAX ? 0.4 : 1 }}
          >
            <Ionicons name="add" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const SEARCH_DEBOUNCE_MS = 400;

export default function CatalogScreen({ navigation }: Props) {
  const store = useStoreProducts();
  const { search, setSearchTerm } = store;
  const { store: authStore } = useAuth();
  const guard = useStoreAccessGuard();
  const [query, setQuery] = useState('');
  const [debouncedQuery, commitQuery] = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [sort, setSort] = useState<StoreProductSort>('recent');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  // Compartilhar vários produtos de uma vez (ex.: "me manda todos os perfumes masculinos"): a
  // consultora filtra por categoria, entra no modo de seleção, escolhe (ou "seleciona todos") e
  // compartilha a lista inteira numa mensagem só, em vez de produto por produto.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [autoSelectingAll, setAutoSelectingAll] = useState(false);

  // A busca é no servidor (nome ou código de barras). Termo vazio = lista principal; nunca envia `search` vazio.
  const term = debouncedQuery.trim();
  const isSearching = term.length > 0;
  const isBarcodeSearch = /^\d{8,14}$/.test(term);

  useEffect(() => {
    setSearchTerm(term);
  }, [term, setSearchTerm]);

  const categoriesQuery = useQuery({ queryKey: queryKeys.storeCategories(), queryFn: listStoreCategories });
  const categories = categoriesQuery.data?.items ?? [];
  const activeCategoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : undefined;

  // Ordenar ou filtrar por categoria precisa acontecer NO SERVIDOR (não só nos itens já carregados),
  // senão o resultado ficaria incompleto/errado numa loja com muitos produtos. Nesse caso a tela usa
  // uma lista própria (com essa chave/parâmetros), em vez da lista principal/busca compartilhada do
  // contexto — que continua sendo o caminho padrão (ordenação "recente", sem categoria).
  const hasCustomView = sort !== 'recent' || categoryId !== null;
  const customQueryKey = queryKeys.storeProducts.list(term, { sort, categoryId: categoryId ?? undefined });
  const customList = usePaginatedList<StoreProduct>(
    (page, pageSize) =>
      guard(() => listStoreProducts(page, pageSize, term, { sort, categoryId: categoryId ?? undefined })),
    { pageSize: STORE_PRODUCTS_PAGE_SIZE, enabled: hasCustomView, queryKey: customQueryKey }
  );

  const list = hasCustomView ? customList : isSearching ? search : store;
  const { items, status, error, actionError, refreshing, loadingMore, hasMore, reload, refresh, loadMore } = list;

  // Visíveis/Ocultos não existe na API: filtra só o que já foi carregado.
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'active') return item.isActive;
        if (filter === 'hidden') return !item.isActive;
        return true;
      }),
    [items, filter]
  );

  // "Selecionar todos" precisa dos produtos que AINDA não carregaram (ex.: 40 perfumes masculinos
  // com página de 20): carrega o resto primeiro, uma página por vez, e só marca todos quando não
  // sobrar mais nada pra buscar. `loadMore`/`hasMore` já vêm atualizados a cada render.
  useEffect(() => {
    if (!autoSelectingAll) return;
    if (hasMore) {
      if (!loadingMore) void loadMore();
      return;
    }
    setSelectedIds(new Set(filtered.map((item) => item.id)));
    setAutoSelectingAll(false);
  }, [autoSelectingAll, hasMore, loadingMore, filtered, loadMore]);

  function toggleSelectionMode() {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
    setAutoSelectingAll(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (hasMore) setAutoSelectingAll(true);
    else setSelectedIds(new Set(filtered.map((item) => item.id)));
  }

  // Só marca a caixa como "tudo selecionado" quando não tem mais nada pra carregar (senão o
  // checkbox pareceria marcado sem realmente cobrir os produtos que ainda faltam vir do servidor).
  const allFilteredSelected =
    !hasMore && filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id));

  function handleShareSelected() {
    const selected = filtered.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    const lines = selected.map((item) => {
      const price = item.isPromoActive && item.promoPrice !== null ? item.promoPrice : item.price;
      return `• ${item.product.name} - ${formatCurrency(price)}`;
    });
    const link = authStore?.catalogLink;
    const message = `Confira esses produtos na minha loja:\n\n${lines.join('\n')}${link ? `\n\nLoja: ${link}` : ''}`;
    Share.share({ message }).catch(() => {
      // Fechar/cancelar o share sheet não é erro.
    });
  }

  // A leitura da câmera é intencional: busca já, sem esperar o debounce da digitação.
  function handleScanned(code: string) {
    setScannerVisible(false);
    const value = code.trim();
    if (!value) return;
    setQuery(value);
    commitQuery(value);
  }

  function renderEmpty() {
    if (status === 'idle' || status === 'loading') return <SkeletonRows Row={ProductCardSkeleton} />;
    if (status === 'error') return <ErrorState message={error ?? 'Tente novamente.'} onRetry={() => void reload()} />;
    if (isSearching) {
      return (
        <EmptyState
          icon="search-outline"
          title="Nenhum produto encontrado"
          subtitle={
            isBarcodeSearch
              ? `Nenhum produto da sua loja tem o código de barras ${term}.`
              : `Nada na sua loja corresponde a "${term}".`
          }
        />
      );
    }
    if (store.total === 0 && store.items.length === 0) {
      return (
        <EmptyState
          icon="cube-outline"
          title="Sua loja ainda não tem produtos"
          subtitle="Escolha produtos do catálogo, defina o seu preço e comece a vender."
          actionLabel="Adicionar do catálogo"
          onAction={() => navigation.navigate('NewProduct')}
        />
      );
    }
    // Só o filtro Visíveis/Ocultos (local) não achou nada entre os carregados.
    return (
      <EmptyState
        icon="funnel-outline"
        title="Nenhum produto neste filtro"
        subtitle={hasMore ? 'O filtro considera só os produtos já carregados.' : undefined}
        actionLabel={hasMore ? 'Carregar mais produtos' : undefined}
        onAction={hasMore ? () => void loadMore() : undefined}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <View className="px-5 pt-3 pb-2">
        <View className="flex-row items-center justify-between mb-3.5">
          <View>
            <Text className="text-2xl font-extrabold text-ink-900">Estoque</Text>
            {selectionMode ? (
              <Text className="text-xs text-ink-400 mt-0.5">
                {selectedIds.size === 0
                  ? 'Toque nos produtos para selecionar'
                  : `${selectedIds.size} selecionado${selectedIds.size === 1 ? '' : 's'}`}
              </Text>
            ) : (
              store.status === 'ready' && (
                <Text className="text-xs text-ink-400 mt-0.5">
                  {store.total === 1 ? '1 produto na loja' : `${store.total.toLocaleString('pt-BR')} produtos na loja`}
                </Text>
              )
            )}
          </View>
          {selectionMode ? (
            <Pressable
              className="px-4 py-2.5 rounded-full bg-white"
              onPress={toggleSelectionMode}
              accessibilityRole="button"
            >
              <Text className="text-ink-500 text-xs font-bold">Cancelar</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2">
              <Pressable
                className="w-10 h-10 rounded-full bg-white items-center justify-center"
                onPress={toggleSelectionMode}
                accessibilityRole="button"
                accessibilityLabel="Selecionar vários produtos para compartilhar"
              >
                <Ionicons name="checkbox-outline" size={18} color="#3A3D4D" />
              </Pressable>
              <Pressable
                className="flex-row items-center gap-1.5 bg-primary-500 rounded-full pl-3 pr-4 py-2.5"
                onPress={() => navigation.navigate('NewProduct')}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text className="text-white text-xs font-bold">Novo Produto</Text>
              </Pressable>
            </View>
          )}
        </View>

        {selectionMode && (
          <View className="flex-row items-center justify-between mb-3">
            <Pressable
              onPress={() => (allFilteredSelected ? setSelectedIds(new Set()) : selectAll())}
              disabled={autoSelectingAll}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allFilteredSelected }}
              className="flex-row items-center gap-2"
            >
              <Ionicons
                name={allFilteredSelected ? 'checkbox' : 'square-outline'}
                size={20}
                color={allFilteredSelected ? '#FF6B00' : '#8B8FA3'}
              />
              <Text className="text-xs font-bold text-ink-700">
                {autoSelectingAll ? 'Selecionando todos...' : 'Selecionar todos'}
              </Text>
            </Pressable>
            {selectedIds.size > 0 && (
              <Pressable onPress={() => setSelectedIds(new Set())} accessibilityRole="button">
                <Text className="text-xs font-bold text-ink-400">Limpar seleção</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="flex-row items-center gap-2 mb-3">
          <View className="flex-1 flex-row items-center bg-white rounded-xl px-3 h-11 gap-2">
            <Ionicons name="search" size={18} color="#8B8FA3" />
            <TextInput
              placeholder="Buscar por nome ou código de barras..."
              placeholderTextColor="#8B8FA3"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              accessibilityLabel="Buscar por nome ou código de barras"
              autoCorrect={false}
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

        <View className="flex-row gap-2">
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
        </View>

        <View className="flex-row gap-2 mt-2">
          <Pressable
            onPress={() => setSortModalVisible(true)}
            accessibilityRole="button"
            className={`flex-row items-center gap-1 px-3.5 py-2 rounded-full ${sort !== 'recent' ? 'bg-primary-500' : 'bg-white'}`}
          >
            <Ionicons name="swap-vertical-outline" size={14} color={sort !== 'recent' ? '#fff' : '#8B8FA3'} />
            <Text className={`text-xs font-bold ${sort !== 'recent' ? 'text-white' : 'text-ink-500'}`} numberOfLines={1}>
              {SORT_LABEL.get(sort)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCategoryModalVisible(true)}
            accessibilityRole="button"
            className={`flex-row items-center gap-1 px-3.5 py-2 rounded-full ${categoryId ? 'bg-primary-500' : 'bg-white'}`}
            style={{ maxWidth: 160 }}
          >
            <Ionicons name="pricetag-outline" size={14} color={categoryId ? '#fff' : '#8B8FA3'} />
            <Text
              className={`text-xs font-bold flex-shrink ${categoryId ? 'text-white' : 'text-ink-500'}`}
              numberOfLines={1}
            >
              {activeCategoryName ?? 'Categoria'}
            </Text>
          </Pressable>
        </View>

        {status === 'ready' && filter !== 'all' && (
          <Text className="text-[11px] text-ink-400 mt-2.5">
            Mostrando {filtered.length} entre os {items.length} produtos carregados
            {hasMore ? '. Role a lista para carregar mais.' : '.'}
          </Text>
        )}
        {status === 'ready' && isSearching && filter === 'all' && (
          <Text className="text-[11px] text-ink-400 mt-2.5">
            {list.total === 1 ? '1 resultado' : `${list.total.toLocaleString('pt-BR')} resultados`} para "{term}"
          </Text>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 8,
          paddingBottom: selectionMode && selectedIds.size > 0 ? 96 : 20,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={
          <ListFooter loading={loadingMore} error={items.length > 0 ? actionError : null} onRetry={() => void loadMore()} />
        }
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onPress={() => navigation.navigate('ProductDetail', { storeProductId: item.id })}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        )}
      />

      {selectionMode && selectedIds.size > 0 && (
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, zIndex: 20 }}>
          <Pressable
            onPress={handleShareSelected}
            accessibilityRole="button"
            accessibilityLabel={`Compartilhar ${selectedIds.size} produtos selecionados no WhatsApp`}
            className="flex-row items-center justify-center gap-2 bg-primary-500 rounded-2xl h-14"
            style={{
              elevation: 4,
              shadowColor: '#FF6B00',
              shadowOpacity: 0.3,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text className="text-white text-sm font-bold">Compartilhar ({selectedIds.size})</Text>
          </Pressable>
        </View>
      )}

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
      />

      <OptionsSheetModal
        visible={sortModalVisible}
        title="Ordenar por"
        options={SORT_OPTIONS}
        selectedKey={sort}
        onClose={() => setSortModalVisible(false)}
        onSelect={(key) => {
          setSort(key as StoreProductSort);
          setSortModalVisible(false);
        }}
      />

      <OptionsSheetModal
        visible={categoryModalVisible}
        title="Filtrar por categoria"
        options={[
          { key: NO_CATEGORY_KEY, label: 'Todas as categorias' },
          ...categories.map((category) => ({
            key: category.id,
            label: category.name,
            sublabel: category.productCount === 1 ? '1 produto' : `${category.productCount} produtos`,
          })),
        ]}
        selectedKey={categoryId ?? NO_CATEGORY_KEY}
        emptyLabel="Você ainda não criou nenhuma categoria. Crie uma ao editar um produto."
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(key) => {
          setCategoryId(key === NO_CATEGORY_KEY ? null : key);
          setCategoryModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}
