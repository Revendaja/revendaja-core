import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import ProductImage from '../../components/ProductImage';
import { getErrorMessage, isApiError } from '../../api/errors';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useSubmitting } from '../../hooks/useSubmitting';
import {
  formatCurrency,
  formatPriceInput,
  hasSuggestedPrice,
  maskPriceInput,
  parsePriceInput,
  PRICE_ERROR_MESSAGE,
} from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'QuickAddProduct'>;

// Adição rápida vinda da Nova venda: produto do catálogo que a loja ainda não tem. Pede só o preço de
// venda; entra com estoque 0 e a pessoa segue para o produto, onde coloca a quantidade.
export default function QuickAddProductScreen({ navigation, route }: Props) {
  const { catalogProduct: product } = route.params;
  const { add, refresh } = useStoreProducts();
  const { loading, run } = useSubmitting();
  const suggested = hasSuggestedPrice(product.basePrice);

  const [price, setPrice] = useState(suggested ? formatPriceInput(product.basePrice) : '');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function handleSubmit() {
    setFormError(null);
    const value = parsePriceInput(price);
    if (!price.trim() || value === null) {
      setPriceError(price.trim() ? PRICE_ERROR_MESSAGE : 'Informe o seu preço de venda.');
      return;
    }
    setPriceError(null);

    void run(async () => {
      try {
        const created = await add(product.id, value, 0);
        // Troca esta tela pelo produto: voltar leva à lista do Estoque, não de volta ao formulário.
        navigation.replace('ProductDetail', { storeProductId: created.id });
      } catch (error) {
        if (isApiError(error) && error.status === 409) {
          // Já estava na loja: não é falha, só recarrega e volta.
          void refresh();
          navigation.goBack();
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 p-5">
          <View className="flex-row items-center justify-between mb-5">
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

          {formError && <Banner type="error" message={formError} />}

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Preço de venda</Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-4 h-12"
            style={{ borderWidth: 1.5, borderColor: priceError ? '#E0453F' : focused ? '#FF6B00' : 'transparent' }}
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
              editable={!loading}
              autoFocus
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

          <Text className="text-xs text-ink-400 mt-4">Em seguida você define a quantidade no estoque.</Text>

          <View className="mt-5">
            <PrimaryButton label="Adicionar e ir para o estoque" onPress={handleSubmit} loading={loading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
