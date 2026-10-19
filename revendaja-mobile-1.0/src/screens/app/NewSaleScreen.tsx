import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ProductImage from '../../components/ProductImage';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import { createSale } from '../../api/sales';
import { listStoreProducts } from '../../api/storeProducts';
import { getErrorMessage, isApiError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import type { CreateSaleInput, NewSalePaymentMethod, StoreProduct } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { formatCurrency } from '../../utils/format';
import { createSaleAttemptTracker, isDefinitiveRejection, saleContentKey } from '../../utils/saleAttempt';
import { PAYMENT_CHIPS, PAYMENT_ICON, roundMoney } from '../../utils/sales';
import { newRequestId } from '../../utils/uuid';
import type { RootTabParamList } from '../../navigation/types';

type Props = BottomTabScreenProps<RootTabParamList, 'NovaVenda'>;

type CartLine = { item: StoreProduct; quantity: number };

const CUSTOMER_NAME_MAX = 120;
const MAX_INSTALLMENTS = 24;
const MAX_CART_ITEMS = 50;
const SEARCH_DEBOUNCE_MS = 400;
const RESULTS_LIMIT = 5;

// Código de barras: só dígitos (8 a 14). A API também busca por nome, então o mesmo campo serve para os dois.
const BARCODE_PATTERN = /^\d{8,14}$/;
const stripLeadingZeros = (code: string) => code.replace(/^0+/, '');

export default function NewSaleScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const guard = useStoreAccessGuard();
  const { findById, applyStockDelta, refresh: refreshStoreProducts } = useStoreProducts();
  const queryClient = useQueryClient();
  const { loading, run } = useSubmitting();

  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<NewSalePaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Busca de produto (nome ou código de barras): a mesma pesquisa do servidor, com debounce na digitação.
  const [productQuery, setProductQuery] = useState('');
  const [debouncedQuery, commitQuery] = useDebouncedValue(productQuery, SEARCH_DEBOUNCE_MS);
  const [lookingUp, setLookingUp] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // clientRequestId da venda: acompanha a tentativa (ver saleAttempt.ts).
  const attempt = useRef(createSaleAttemptTracker(newRequestId)).current;

  const term = debouncedQuery.trim();

  // Respostas de buscas antigas nunca se misturam (o TanStack Query já descarta pela chave).
  const searchQuery = useQuery({
    queryKey: queryKeys.storeProducts.quickSearch(term),
    queryFn: () => guard(() => listStoreProducts(1, RESULTS_LIMIT, term)),
    enabled: term.length > 0,
  });
  const results = term ? (searchQuery.data?.items ?? []) : [];
  const searching = term.length > 0 && searchQuery.isFetching;
  const searchError = searchQuery.isError ? getErrorMessage(searchQuery.error) : null;

  // Estoque mais recente: a lista de produtos (atualizada por vendas e edições) vale mais que a cópia do carrinho.
  const stockOf = (line: CartLine) => findById(line.item.id)?.stock ?? line.item.stock;

  const total = roundMoney(cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0));

  function addToCart(item: StoreProduct) {
    const available = findById(item.id)?.stock ?? item.stock;
    if (available <= 0) {
      Alert.alert('Sem estoque', `"${item.product.name}" está esgotado.`);
      return;
    }
    const existing = cart.find((line) => line.item.id === item.id);
    if (!existing && cart.length >= MAX_CART_ITEMS) {
      Alert.alert('Carrinho cheio', `Uma venda aceita até ${MAX_CART_ITEMS} produtos diferentes.`);
      return;
    }
    setFormError(null);
    setCart((current) =>
      existing
        ? current.map((line) =>
            line.item.id === item.id ? { ...line, quantity: Math.min(available, line.quantity + 1) } : line
          )
        : [...current, { item, quantity: 1 }]
    );
    setProductQuery('');
    commitQuery('');
  }

  function changeQuantity(line: CartLine, delta: number) {
    setFormError(null);
    setCart((current) =>
      current
        .map((entry) =>
          entry === line ? { ...entry, quantity: Math.min(stockOf(entry), entry.quantity + delta) } : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  }

  // Leitura da câmera / "ok" no teclado com um código: adiciona direto se achar exatamente esse produto.
  async function addByCode(code: string) {
    const value = code.trim();
    if (!value) return;
    if (!BARCODE_PATTERN.test(value)) {
      // Não é código de barras: deixa a busca por nome mostrar as opções.
      commitQuery(value);
      return;
    }

    setLookingUp(true);
    try {
      const page = await guard(() => listStoreProducts(1, RESULTS_LIMIT, value));
      const exact = page.items.filter(
        (item) => item.product.barCode && stripLeadingZeros(item.product.barCode) === stripLeadingZeros(value)
      );
      const match = exact.length === 1 ? exact[0] : page.items.length === 1 ? page.items[0] : null;
      if (match) {
        addToCart(match);
      } else if (page.items.length === 0) {
        Alert.alert('Produto não encontrado', `Nenhum produto da sua loja tem o código ${value}.`);
        setProductQuery('');
      } else {
        // Mais de um resultado: quem escolhe é o usuário.
        setProductQuery(value);
        commitQuery(value);
      }
    } catch (error) {
      Alert.alert('Ops!', getErrorMessage(error));
    } finally {
      setLookingUp(false);
    }
  }

  function handleScanned(code: string) {
    setScannerVisible(false);
    void addByCode(code);
  }

  function resetForm() {
    setCustomerName('');
    setPaymentMethod('pix');
    setInstallments(1);
    setCart([]);
    setProductQuery('');
    commitQuery('');
    setNameError(null);
    setFormError(null);
  }

  function handleSubmit() {
    setFormError(null);
    const name = customerName.trim();
    if (!name || name.length > CUSTOMER_NAME_MAX) {
      setNameError(`Informe o nome do cliente (até ${CUSTOMER_NAME_MAX} caracteres).`);
      return;
    }
    setNameError(null);
    if (cart.length === 0) {
      setFormError('Adicione ao menos um produto à venda.');
      return;
    }
    const overStock = cart.find((line) => line.quantity > stockOf(line));
    if (overStock) {
      setFormError(`Estoque insuficiente para "${overStock.item.product.name}": disponível ${stockOf(overStock)}.`);
      return;
    }

    // O app não envia preço nem status: o servidor usa o preço atual do produto e define o status pelo pagamento.
    const content: Omit<CreateSaleInput, 'clientRequestId'> = {
      customerName: name,
      paymentMethod,
      ...(paymentMethod === 'card' ? { installments } : {}),
      items: cart.map((line) => ({ storeProductId: line.item.id, quantity: line.quantity })),
    };
    const sold = content.items;

    void run(async () => {
      try {
        // Mesma venda, nova tentativa (rede/timeout/toque duplo) → mesmo id; venda diferente → id novo.
        const clientRequestId = attempt.idFor(saleContentKey(content));
        const { replayed } = await guard(() => createSale({ clientRequestId, ...content }));
        attempt.reset();

        // 201: o servidor baixou o estoque agora → desconta localmente. 200 (mesma venda repetida): a baixa já
        // tinha acontecido na primeira tentativa, então recarrega o estoque em vez de descontar de novo.
        if (replayed) void refreshStoreProducts();
        else applyStockDelta(sold);

        // Finanças e Início mostram números que essa venda muda (faturamento, a receber...).
        void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
        resetForm();
        navigation.navigate('FinancasStack');
      } catch (error) {
        // 400/404/409: o servidor recusou (nada foi gravado) e o usuário vai ajustar → id novo no reenvio.
        // Sem resposta (rede/timeout) ou 5xx: pode ter gravado → o retry reaproveita o mesmo id.
        if (isDefinitiveRejection(error)) attempt.reset();
        // 409 "Estoque insuficiente ... disponível N": o `message` já traz o N real; atualiza o estoque local.
        if (isApiError(error) && error.status === 409) void refreshStoreProducts();
        setFormError(getErrorMessage(error));
      }
    });
  }

  const showResults = term.length > 0 && !lookingUp;
  const cartTotalLabel = useMemo(() => formatCurrency(total), [total]);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-1 bg-ink-50" style={{ paddingTop: insets.top }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-2xl font-extrabold text-ink-900 mb-4">Nova Venda</Text>

          {formError && <Banner type="error" message={formError} />}

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Nome do cliente</Text>
          <TextInput
            value={customerName}
            onChangeText={(text) => {
              setCustomerName(text);
              if (nameError) setNameError(null);
            }}
            placeholder="Ex: Ana Souza"
            placeholderTextColor="#8B8FA3"
            autoCapitalize="words"
            maxLength={CUSTOMER_NAME_MAX}
            editable={!loading}
            accessibilityLabel="Nome do cliente"
            className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900"
            style={{ borderWidth: 1.5, borderColor: nameError ? '#E0453F' : 'transparent' }}
          />
          {!!nameError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {nameError}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Forma de pagamento</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {PAYMENT_CHIPS.map(({ method, label }) => {
              const active = method === paymentMethod;
              return (
                <Pressable
                  key={method}
                  onPress={() => setPaymentMethod(method)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-row items-center gap-1.5 px-3.5 py-2.5 rounded-full ${
                    active ? 'bg-primary-500' : 'bg-white'
                  }`}
                >
                  <Ionicons name={PAYMENT_ICON[method]} size={15} color={active ? '#fff' : '#8B8FA3'} />
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-ink-500'}`}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {paymentMethod === 'card' && (
            <View className="flex-row items-center justify-between bg-white rounded-xl px-4 h-12 mt-3">
              <Text className="text-sm text-ink-700">Parcelas</Text>
              <View className="flex-row items-center bg-ink-50 rounded-full">
                <Pressable
                  onPress={() => setInstallments((value) => Math.max(1, value - 1))}
                  disabled={installments <= 1 || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Diminuir parcelas"
                  className="w-8 h-8 items-center justify-center"
                  style={{ opacity: installments <= 1 ? 0.4 : 1 }}
                >
                  <Ionicons name="remove" size={16} color="#3A3D4D" />
                </Pressable>
                <Text className="text-sm font-bold text-ink-900 text-center" style={{ minWidth: 64 }}>
                  {installments === 1 ? 'à vista' : `${installments}x`}
                </Text>
                <Pressable
                  onPress={() => setInstallments((value) => Math.min(MAX_INSTALLMENTS, value + 1))}
                  disabled={installments >= MAX_INSTALLMENTS || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Aumentar parcelas"
                  className="w-8 h-8 rounded-full bg-primary-500 items-center justify-center"
                  style={{ opacity: installments >= MAX_INSTALLMENTS ? 0.4 : 1 }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Adicionar produto</Text>
          <View className="flex-row items-center gap-2 mb-1">
            <View className="flex-1 flex-row items-center bg-white rounded-xl px-3 h-11 gap-2">
              <Ionicons name="barcode-outline" size={18} color="#8B8FA3" />
              <TextInput
                value={productQuery}
                onChangeText={setProductQuery}
                onSubmitEditing={() => void addByCode(productQuery)}
                placeholder="Nome ou código de barras"
                placeholderTextColor="#8B8FA3"
                returnKeyType="search"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel="Buscar produto por nome ou código de barras"
                className="flex-1 text-sm text-ink-900"
              />
              {(searching || lookingUp) && <ActivityIndicator size="small" color="#FF6B00" />}
              {productQuery.length > 0 && !searching && !lookingUp && (
                <Pressable
                  onPress={() => {
                    setProductQuery('');
                    commitQuery('');
                  }}
                  hitSlop={8}
                  accessibilityLabel="Limpar busca"
                >
                  <Ionicons name="close-circle" size={18} color="#C7C9D9" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setScannerVisible(true)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Escanear código de barras"
              className="w-11 h-11 rounded-xl bg-primary-500 items-center justify-center"
            >
              <Ionicons name="barcode-outline" size={20} color="#fff" />
            </Pressable>
          </View>

          {showResults && (
            <View className="bg-white rounded-xl mt-1.5 overflow-hidden">
              {searchError ? (
                <Text className="text-xs text-ink-400 px-4 py-3">{searchError}</Text>
              ) : results.length === 0 && !searching ? (
                <Text className="text-xs text-ink-400 px-4 py-3">Nenhum produto da sua loja encontrado.</Text>
              ) : (
                results.map((item, index) => {
                  const outOfStock = item.stock <= 0;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => addToCart(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar ${item.product.name}`}
                      className="flex-row items-center px-3 py-2.5"
                      style={[
                        index > 0 ? { borderTopWidth: 1, borderTopColor: '#F5F6FA' } : undefined,
                        outOfStock ? { opacity: 0.5 } : undefined,
                      ]}
                    >
                      <ProductImage
                        uri={item.product.productImageSm}
                        resizeMode="cover"
                        iconName="cube"
                        iconSize={16}
                        iconColor="#FF6B00"
                        style={{ width: 36, height: 36, borderRadius: 10, marginRight: 10 }}
                      />
                      <View className="flex-1 pr-2">
                        <Text className="text-sm font-semibold text-ink-900" numberOfLines={1}>
                          {item.product.name}
                        </Text>
                        <Text className="text-xs text-ink-400 mt-0.5">
                          {formatCurrency(item.price)} · {outOfStock ? 'Esgotado' : `Estoque: ${item.stock}`}
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={22} color="#FF6B00" />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {cart.length === 0 ? (
            <View className="items-center py-12">
              <Ionicons name="basket-outline" size={40} color="#C7C9D9" />
              <Text className="text-sm font-semibold text-ink-500 mt-3">Carrinho vazio</Text>
              <Text className="text-xs text-ink-400 mt-1 text-center">
                Busque pelo nome ou escaneie o código de barras para adicionar produtos
              </Text>
            </View>
          ) : (
            <View className="mt-3">
              {cart.map((line) => {
                const available = stockOf(line);
                return (
                  <View key={line.item.id} className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
                    <ProductImage
                      uri={line.item.product.productImageSm}
                      resizeMode="cover"
                      iconName="cube"
                      iconSize={20}
                      iconColor="#FF6B00"
                      style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12 }}
                    />
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
                        {line.item.product.name}
                      </Text>
                      <Text className="text-xs text-ink-500 mt-0.5">
                        {formatCurrency(line.item.price)} · Estoque: {available}
                      </Text>
                    </View>
                    <View className="flex-row items-center bg-ink-50 rounded-full">
                      <Pressable
                        onPress={() => changeQuantity(line, -1)}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel={`Diminuir ${line.item.product.name}`}
                        className="w-8 h-8 items-center justify-center"
                      >
                        <Ionicons name="remove" size={16} color="#3A3D4D" />
                      </Pressable>
                      <Text className="text-sm font-bold text-ink-900 text-center" style={{ minWidth: 24, paddingHorizontal: 2 }}>
                        {line.quantity}
                      </Text>
                      <Pressable
                        onPress={() => changeQuantity(line, 1)}
                        disabled={loading || line.quantity >= available}
                        accessibilityRole="button"
                        accessibilityLabel={`Aumentar ${line.item.product.name}`}
                        className="w-8 h-8 rounded-full bg-primary-500 items-center justify-center"
                        style={{ opacity: line.quantity >= available ? 0.4 : 1 }}
                      >
                        <Ionicons name="add" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View className="bg-white px-5 pt-3 pb-4" style={{ elevation: 8 }}>
          {cart.length > 0 && (
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-ink-500">Total da venda</Text>
              <Text className="text-xl font-extrabold text-ink-900">{cartTotalLabel}</Text>
            </View>
          )}
          <PrimaryButton label="Finalizar Venda" onPress={handleSubmit} loading={loading} />
        </View>

        <BarcodeScannerModal
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScanned={handleScanned}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
