import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import OptionsSheetModal from '../../components/OptionsSheetModal';
import ProductImage from '../../components/ProductImage';
import { getErrorMessage, isApiError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { createStoreCategory, listStoreCategories } from '../../api/storeCategories';
import type { StoreProductChanges } from '../../api/storeProducts';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useSubmitting } from '../../hooks/useSubmitting';
import {
  formatCurrency,
  formatPriceInput,
  hasSuggestedPrice,
  maskPriceInput,
  parsePriceInput,
  parseStockInput,
  PRICE_ERROR_MESSAGE,
  STOCK_ERROR_MESSAGE,
  STOCK_MAX,
} from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'ProductForm'>;

const PROMO_DURATION_OPTIONS = [
  { days: 1, label: 'Até amanhã' },
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
];

function formatPromoEndDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function ProductFormScreen({ navigation, route }: Props) {
  const params = route.params;
  const { add, update, findById, refresh } = useStoreProducts();
  const { loading, run } = useSubmitting();
  const queryClient = useQueryClient();

  const isEditing = 'storeProductId' in params;
  const existing = isEditing ? findById(params.storeProductId) : undefined;
  const product = isEditing ? existing?.product : params.catalogProduct;

  // Ao adicionar: sugere o preço do catálogo só quando ele existe (basePrice = 0 → o campo começa vazio).
  const [price, setPrice] = useState(() => {
    if (existing) return formatPriceInput(existing.price);
    if (product && hasSuggestedPrice(product.basePrice)) return formatPriceInput(product.basePrice);
    return '';
  });
  // Preço de custo é opcional: vazio = "não informado" (null na API). 0 é um custo válido.
  const [cost, setCost] = useState(existing?.costPrice != null ? formatPriceInput(existing.costPrice) : '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [costFocused, setCostFocused] = useState(false);
  const [stockFocused, setStockFocused] = useState(false);

  // Categoria e promoção só existem em produto já salvo (a API só aceita esses campos no PATCH).
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category?.id ?? null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const categoriesQuery = useQuery({
    queryKey: queryKeys.storeCategories(),
    queryFn: listStoreCategories,
    enabled: isEditing,
  });
  const categories = categoriesQuery.data?.items ?? [];

  const [promoEnabled, setPromoEnabled] = useState(existing?.isPromoActive ?? false);
  const [promoPrice, setPromoPrice] = useState(
    existing?.promoPrice != null ? formatPriceInput(existing.promoPrice) : ''
  );
  const [promoEndsAt, setPromoEndsAt] = useState<Date | null>(
    existing?.promoEndsAt ? new Date(existing.promoEndsAt) : null
  );
  const [promoPriceError, setPromoPriceError] = useState<string | null>(null);
  const [promoFocused, setPromoFocused] = useState(false);

  if (!product) {
    return (
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="p-5">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
        </View>
        <Text className="text-center text-ink-500 mt-10">Produto não encontrado na sua loja.</Text>
      </SafeAreaView>
    );
  }

  function validatePrice(): number | null {
    if (!price.trim()) {
      setPriceError('Informe o seu preço de venda.');
      return null;
    }
    const value = parsePriceInput(price);
    if (value === null) {
      setPriceError(PRICE_ERROR_MESSAGE);
      return null;
    }
    setPriceError(null);
    return value;
  }

  // Devolve { ok, value }: value null = campo vazio (custo não informado).
  function validateCost(): { ok: boolean; value: number | null } {
    if (!cost.trim()) {
      setCostError(null);
      return { ok: true, value: null };
    }
    const value = parsePriceInput(cost);
    if (value === null) {
      setCostError('Informe um custo válido (ex.: 39,90) ou deixe em branco.');
      return { ok: false, value: null };
    }
    setCostError(null);
    return { ok: true, value };
  }

  function validateStock(): number | null {
    // Ao adicionar, o estoque é opcional: vazio conta como 0 (esgotado, e já entra nos alertas de estoque baixo).
    // Ao editar continua obrigatório: apagar o campo sem querer não zera o estoque em silêncio.
    if (!isEditing && !stock.trim()) {
      setStockError(null);
      return 0;
    }
    const value = parseStockInput(stock);
    if (value === null) {
      setStockError(STOCK_ERROR_MESSAGE);
      return null;
    }
    setStockError(null);
    return value;
  }

  // Estoque só aceita inteiros: o campo filtra tudo que não é dígito e trava em 1.000.000.
  function handleStockChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 7);
    setStock(digits && Number(digits) > STOCK_MAX ? String(STOCK_MAX) : digits);
    if (stockError) setStockError(null);
  }

  // Stepper (+/−): o valor final é que vai para a API (o PATCH recebe o total, não a diferença).
  function stepStock(delta: number) {
    const next = Math.min(STOCK_MAX, Math.max(0, (parseStockInput(stock) ?? 0) + delta));
    setStock(String(next));
    if (stockError) setStockError(null);
  }

  // Promoção só existe ao editar (a API só aceita esses campos no PATCH). `effectivePrice` é o preço
  // de venda desta mesma gravação: o promocional precisa ser menor que ELE, não o preço antigo.
  function validatePromo(effectivePrice: number): { ok: boolean; price: number | null; endsAt: Date | null } {
    if (!promoEnabled) {
      setPromoPriceError(null);
      return { ok: true, price: null, endsAt: null };
    }
    const value = parsePriceInput(promoPrice);
    if (value === null) {
      setPromoPriceError('Informe o preço promocional.');
      return { ok: false, price: null, endsAt: null };
    }
    if (value >= effectivePrice) {
      setPromoPriceError('O preço promocional precisa ser menor que o preço de venda.');
      return { ok: false, price: null, endsAt: null };
    }
    if (!promoEndsAt) {
      setPromoPriceError('Escolha por quanto tempo a promoção vale.');
      return { ok: false, price: null, endsAt: null };
    }
    setPromoPriceError(null);
    return { ok: true, price: value, endsAt: promoEndsAt };
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    setCreatingCategory(true);
    setCategoryFormError(null);
    try {
      const created = await createStoreCategory(trimmed);
      queryClient.setQueryData(queryKeys.storeCategories(), (current: { items: typeof categories } | undefined) => ({
        items: [...(current?.items ?? []), created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }));
      setCategoryId(created.id);
      setNewCategoryName('');
      setCategoryModalVisible(false);
    } catch (error) {
      setCategoryFormError(getErrorMessage(error));
    } finally {
      setCreatingCategory(false);
    }
  }

  function handleSave() {
    setFormError(null);
    const value = validatePrice();
    const costResult = validateCost();
    const stockValue = validateStock();
    const promoResult = validatePromo(value ?? 0);
    if (value === null || !costResult.ok || stockValue === null || !promoResult.ok) return;
    const costValue = costResult.value;

    void run(async () => {
      try {
        if (existing) {
          // Envia só o que mudou; se nada mudou, não há o que salvar. Custo vazio (null) limpa o custo.
          const changes: StoreProductChanges = {};
          if (value !== existing.price) changes.price = value;
          if (costValue !== existing.costPrice) changes.costPrice = costValue;
          if (stockValue !== existing.stock) changes.stock = stockValue;
          if (isActive !== existing.isActive) changes.isActive = isActive;
          if (categoryId !== (existing.category?.id ?? null)) changes.categoryId = categoryId;
          if (promoEnabled) {
            const nextEndsAtIso = promoResult.endsAt!.toISOString();
            if (!existing.isPromoActive || promoResult.price !== existing.promoPrice || nextEndsAtIso !== existing.promoEndsAt) {
              changes.promoPrice = promoResult.price;
              changes.promoEndsAt = nextEndsAtIso;
            }
          } else if (existing.isPromoActive) {
            changes.promoPrice = null;
            changes.promoEndsAt = null;
          }
          if (Object.keys(changes).length > 0) await update(existing.id, changes);
          navigation.goBack();
          return;
        }

        // Chegar aqui (sem `existing`) só acontece vindo do catálogo (`params.catalogProduct`), nunca
        // de um produto manual: `product!.id` é sempre um id de catálogo de verdade, nunca null.
        // Custo vazio não é enviado ("não informado"); 0 é enviado como custo válido.
        await add(product!.id!, value, stockValue, costValue ?? undefined);
        // Volta pro Estoque (topo da pilha): o produto novo já aparece no topo da lista, mostrando
        // que foi adicionado com sucesso.
        navigation.popToTop();
      } catch (error) {
        if (isApiError(error) && error.status === 409) {
          // "Este produto já está na sua loja." não é falha: vira o estado "já adicionado".
          setAlreadyAdded(true);
          return;
        }
        if (existing && isApiError(error) && error.status === 404) {
          // "Produto não encontrado na sua loja.": já não existe mais.
          Alert.alert('Ops!', getErrorMessage(error));
          void refresh();
          navigation.popToTop();
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  const suggested = hasSuggestedPrice(product.basePrice);

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center justify-between mb-5">
            <Pressable
              className="w-10 h-10 rounded-full bg-white items-center justify-center"
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
            >
              <Ionicons name="arrow-back" size={22} color="#1A1B25" />
            </Pressable>
            <Text className="text-lg font-extrabold text-ink-900">{isEditing ? 'Editar Produto' : 'Novo Produto'}</Text>
            <View className="w-10 h-10" />
          </View>

          <View className="flex-row items-center bg-white rounded-2xl p-3 mb-5" style={{ elevation: 1 }}>
            <ProductImage
              uri={product.productImageSm}
              style={{ width: 56, height: 56, borderRadius: 12, marginRight: 12 }}
              iconSize={24}
            />
            <View className="flex-1">
              <Text className="text-[10px] font-bold text-primary-600 uppercase" numberOfLines={1}>
                {product.brand.name}
              </Text>
              <Text className="text-sm font-bold text-ink-900" numberOfLines={2}>
                {product.name}
              </Text>
            </View>
          </View>

          {alreadyAdded && <Banner type="info" message="Este produto já está na sua loja." />}
          {formError && <Banner type="error" message={formError} />}

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Preço de venda</Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-4 h-12"
            style={{
              borderWidth: 1.5,
              borderColor: priceError ? '#E0453F' : focused ? '#FF6B00' : 'transparent',
              opacity: alreadyAdded ? 0.6 : 1,
            }}
          >
            <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
            <TextInput
              value={price}
              onChangeText={(text) => {
                setPrice(maskPriceInput(text));
                if (priceError) setPriceError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="0,00"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              editable={!loading && !alreadyAdded}
              accessibilityLabel="Preço de venda"
              className="flex-1 text-sm text-ink-900"
            />
          </View>
          {priceError ? (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {priceError}
            </Text>
          ) : (
            <Text className="text-xs text-ink-400 mt-1.5">
              {suggested
                ? `Preço sugerido pelo catálogo: ${formatCurrency(product.basePrice)}. Você pode alterar.`
                : 'Este produto não tem preço sugerido. Defina o seu.'}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Preço de custo (opcional)</Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-4 h-12"
            style={{
              borderWidth: 1.5,
              borderColor: costError ? '#E0453F' : costFocused ? '#FF6B00' : 'transparent',
              opacity: alreadyAdded ? 0.6 : 1,
            }}
          >
            <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
            <TextInput
              value={cost}
              onChangeText={(text) => {
                setCost(maskPriceInput(text));
                if (costError) setCostError(null);
              }}
              onFocus={() => setCostFocused(true)}
              onBlur={() => setCostFocused(false)}
              placeholder="0,00"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              editable={!loading && !alreadyAdded}
              accessibilityLabel="Preço de custo (opcional)"
              className="flex-1 text-sm text-ink-900"
            />
          </View>
          {costError ? (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {costError}
            </Text>
          ) : (
            <Text className="text-xs text-ink-400 mt-1.5">
              Quanto você paga por unidade. Usado para calcular o lucro em Finanças; pode deixar em branco.
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">
            {isEditing ? 'Quantidade em estoque' : 'Quantidade em estoque (opcional)'}
          </Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-1.5 h-12"
            style={{
              borderWidth: 1.5,
              borderColor: stockError ? '#E0453F' : stockFocused ? '#FF6B00' : 'transparent',
              opacity: alreadyAdded ? 0.6 : 1,
            }}
          >
            <Pressable
              onPress={() => stepStock(-1)}
              disabled={loading || alreadyAdded}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Diminuir estoque"
              className="w-9 h-9 rounded-full bg-ink-50 items-center justify-center"
            >
              <Ionicons name="remove" size={18} color="#3A3D4D" />
            </Pressable>
            <TextInput
              value={stock}
              onChangeText={handleStockChange}
              onFocus={() => setStockFocused(true)}
              onBlur={() => setStockFocused(false)}
              placeholder="0"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              maxLength={7}
              editable={!loading && !alreadyAdded}
              accessibilityLabel={isEditing ? 'Quantidade em estoque' : 'Quantidade em estoque (opcional)'}
              className="flex-1 text-base font-bold text-ink-900 text-center"
            />
            <Pressable
              onPress={() => stepStock(1)}
              disabled={loading || alreadyAdded}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Aumentar estoque"
              className="w-9 h-9 rounded-full bg-primary-500 items-center justify-center"
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
          {stockError ? (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {stockError}
            </Text>
          ) : (
            <Text className="text-xs text-ink-400 mt-1.5">
              {isEditing
                ? 'Quantas unidades você tem deste produto agora. Use 0 para esgotado.'
                : 'Quantas unidades você tem agora. Em branco conta como 0 (esgotado) e o produto entra nos avisos de estoque baixo.'}
            </Text>
          )}

          {isEditing && (
            <View className="bg-white rounded-2xl px-4 py-3 mt-5 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-bold text-ink-900">Visível na vitrine</Text>
                <Text className="text-xs text-ink-400 mt-0.5">Escondido, sai da vitrine mas mantém o preço</Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                disabled={loading}
                trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
                thumbColor="#fff"
                accessibilityLabel="Mostrar produto na vitrine"
              />
            </View>
          )}

          {isEditing && (
            <Pressable
              onPress={() => setCategoryModalVisible(true)}
              disabled={loading}
              accessibilityRole="button"
              className="bg-white rounded-2xl px-4 py-3 mt-3 flex-row items-center justify-between"
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-bold text-ink-900">Categoria</Text>
                <Text className="text-xs text-ink-400 mt-0.5">
                  {categories.find((c) => c.id === categoryId)?.name ?? 'Sem categoria'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8B8FA3" />
            </Pressable>
          )}

          {isEditing && (
            <View className="bg-white rounded-2xl px-4 py-3 mt-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-ink-900">Colocar em promoção</Text>
                  <Text className="text-xs text-ink-400 mt-0.5">Mostra um preço com desconto por tempo limitado</Text>
                </View>
                <Switch
                  value={promoEnabled}
                  onValueChange={(value) => {
                    setPromoEnabled(value);
                    if (promoPriceError) setPromoPriceError(null);
                  }}
                  disabled={loading}
                  trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
                  thumbColor="#fff"
                  accessibilityLabel="Colocar produto em promoção"
                />
              </View>

              {promoEnabled && (
                <View className="mt-3.5">
                  <View
                    className="flex-row items-center bg-ink-50 rounded-xl px-4 h-12"
                    style={{
                      borderWidth: 1.5,
                      borderColor: promoPriceError ? '#E0453F' : promoFocused ? '#FF6B00' : 'transparent',
                    }}
                  >
                    <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
                    <TextInput
                      value={promoPrice}
                      onChangeText={(text) => {
                        setPromoPrice(maskPriceInput(text));
                        if (promoPriceError) setPromoPriceError(null);
                      }}
                      onFocus={() => setPromoFocused(true)}
                      onBlur={() => setPromoFocused(false)}
                      placeholder="0,00"
                      placeholderTextColor="#8B8FA3"
                      keyboardType="number-pad"
                      editable={!loading}
                      accessibilityLabel="Preço promocional"
                      className="flex-1 text-sm text-ink-900"
                    />
                  </View>

                  <Text className="text-xs font-bold text-ink-500 mt-3 mb-1.5">Validade</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {PROMO_DURATION_OPTIONS.map((option) => (
                      <Pressable
                        key={option.days}
                        onPress={() => setPromoEndsAt(new Date(Date.now() + option.days * 24 * 60 * 60 * 1000))}
                        disabled={loading}
                        accessibilityRole="button"
                        className="px-3 py-1.5 rounded-full bg-ink-50"
                      >
                        <Text className="text-xs font-bold text-ink-500">{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {promoEndsAt && (
                    <Text className="text-xs text-ink-400 mt-2.5">
                      Promoção válida até {formatPromoEndDate(promoEndsAt)}
                    </Text>
                  )}
                  {promoPriceError && (
                    <Text className="text-xs text-danger mt-2" accessibilityLiveRegion="polite">
                      {promoPriceError}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          <View className="mt-6">
            {alreadyAdded ? (
              <PrimaryButton label="Voltar ao catálogo" onPress={() => navigation.goBack()} />
            ) : (
              <PrimaryButton
                label={isEditing ? 'Salvar Alterações' : 'Adicionar à minha loja'}
                onPress={handleSave}
                loading={loading}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionsSheetModal
        visible={categoryModalVisible}
        title="Categoria"
        options={[
          { key: 'none', label: 'Sem categoria' },
          ...categories.map((category) => ({
            key: category.id,
            label: category.name,
            sublabel: category.productCount === 1 ? '1 produto' : `${category.productCount} produtos`,
          })),
        ]}
        selectedKey={categoryId ?? 'none'}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(key) => {
          setCategoryId(key === 'none' ? null : key);
          setCategoryModalVisible(false);
        }}
        footer={
          <View className="bg-white rounded-2xl p-3 mt-1">
            <Text className="text-xs font-bold text-ink-500 mb-2">Criar nova categoria</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Ex: Perfumaria"
                placeholderTextColor="#8B8FA3"
                maxLength={40}
                editable={!creatingCategory}
                accessibilityLabel="Nome da nova categoria"
                className="flex-1 bg-ink-50 rounded-xl px-3 h-11 text-sm text-ink-900"
              />
              <Pressable
                onPress={() => void handleCreateCategory()}
                disabled={creatingCategory || !newCategoryName.trim()}
                accessibilityRole="button"
                accessibilityLabel="Criar categoria"
                className="w-11 h-11 rounded-xl bg-primary-500 items-center justify-center"
                style={{ opacity: creatingCategory || !newCategoryName.trim() ? 0.5 : 1 }}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
              </Pressable>
            </View>
            {categoryFormError && <Text className="text-xs text-danger mt-2">{categoryFormError}</Text>}
          </View>
        }
      />
    </SafeAreaView>
  );
}
