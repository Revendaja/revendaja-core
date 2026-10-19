import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import OptionsSheetModal from '../../components/OptionsSheetModal';
import ProductImage from '../../components/ProductImage';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { createStoreCategory, listStoreCategories } from '../../api/storeCategories';
import { uploadProductImage } from '../../api/storeProducts';
import type { StoreProductChanges } from '../../api/storeProducts';
import type { StoreProduct } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useSubmitting } from '../../hooks/useSubmitting';
import {
  formatCurrency,
  formatPriceInput,
  maskPriceInput,
  parsePriceInput,
  parseStockInput,
  PRICE_ERROR_MESSAGE,
  STOCK_ERROR_MESSAGE,
  STOCK_MAX,
} from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

const PROMO_DURATION_OPTIONS = [
  { days: 1, label: 'Até amanhã' },
  { days: 3, label: '3 dias' },
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
];

function formatPromoEndDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type Props = NativeStackScreenProps<EstoqueStackParamList, 'ManualProductForm'>;

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const NAME_ERROR = `Informe o nome do produto (entre ${NAME_MIN} e ${NAME_MAX} caracteres).`;

type ComponentDraft = { storeProductId: string; name: string; image: string | null; quantity: number };

function sameComponents(a: ComponentDraft[], b: ComponentDraft[]): boolean {
  if (a.length !== b.length) return false;
  const key = (c: ComponentDraft) => `${c.storeProductId}:${c.quantity}`;
  const setA = new Set(a.map(key));
  return b.every((c) => setA.has(key(c)));
}

// Escolher, entre os produtos que já estão na loja, quais compõem o kit. Não mostra kits (produto
// que já tem componentes) nem o próprio produto sendo editado: evita kit-dentro-de-kit.
function ComponentPickerModal({
  visible,
  onClose,
  excludeIds,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  excludeIds: ReadonlySet<string>;
  onSelect: (item: StoreProduct) => void;
}) {
  const { items, search, setSearchTerm } = useStoreProducts();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 400);
  const term = debouncedQuery.trim();

  useEffect(() => {
    if (visible) setSearchTerm(term);
  }, [visible, term, setSearchTerm]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const source = term ? search.items : items;
  const candidates = source.filter((item) => !excludeIds.has(item.id) && item.components.length === 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* SafeAreaView não pega a área segura certo dentro de um Modal (mesmo problema contornado em
          BarcodeScannerModal): usa padding fixo no topo em vez disso. */}
      <View className="flex-1 bg-ink-50">
        <View className="flex-row items-center justify-between px-5 pt-14 pb-2">
          <Text className="text-lg font-extrabold text-ink-900">Adicionar produto</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
          >
            <Ionicons name="close" size={20} color="#1A1B25" />
          </Pressable>
        </View>
        <View className="px-5 pb-2">
          <View className="flex-row items-center bg-white rounded-xl px-3 h-11 gap-2">
            <Ionicons name="search" size={18} color="#8B8FA3" />
            <TextInput
              placeholder="Buscar por nome..."
              placeholderTextColor="#8B8FA3"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              accessibilityLabel="Buscar produto do estoque"
              className="flex-1 text-sm text-ink-900"
            />
          </View>
        </View>
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 4, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text className="text-center text-sm text-ink-400 mt-10">Nenhum produto disponível para adicionar.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              className="flex-row items-center bg-white rounded-2xl p-3 mb-3"
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${item.product.name}`}
            >
              <ProductImage
                uri={item.product.productImageSm}
                resizeMode="cover"
                iconName="cube"
                style={{ width: 48, height: 48, borderRadius: 10, marginRight: 12 }}
              />
              <View className="flex-1 pr-2">
                <Text className="text-sm font-bold text-ink-900" numberOfLines={1}>
                  {item.product.name}
                </Text>
                <Text className="text-xs text-ink-400 mt-0.5">
                  {item.stock} em estoque · {formatCurrency(item.price)}
                </Text>
              </View>
              <Ionicons name="add-circle" size={22} color="#FF6B00" />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

export default function ManualProductFormScreen({ navigation, route }: Props) {
  const { findById, addManual, update } = useStoreProducts();
  const { loading, run } = useSubmitting();
  const queryClient = useQueryClient();

  const storeProductId = route.params?.storeProductId;
  const isEditing = storeProductId !== undefined;
  const existing = isEditing ? findById(storeProductId) : undefined;

  const [name, setName] = useState(existing?.product.name ?? '');
  const [description, setDescription] = useState(existing?.product.description ?? '');
  const [remoteImage, setRemoteImage] = useState<string | null>(existing?.product.productImage ?? null);
  const [localImage, setLocalImage] = useState<{ uri: string; mimeType: string } | null>(null);
  const [imageTouched, setImageTouched] = useState(false);
  const [imageSourceModalVisible, setImageSourceModalVisible] = useState(false);
  const [price, setPrice] = useState(existing ? formatPriceInput(existing.price) : '');
  const [cost, setCost] = useState(existing?.costPrice != null ? formatPriceInput(existing.costPrice) : '');
  const [stock, setStock] = useState(existing ? String(existing.stock) : '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [components, setComponents] = useState<ComponentDraft[]>(
    existing?.components.map((c) => ({ storeProductId: c.storeProductId, name: c.name, image: c.image, quantity: c.quantity })) ??
      []
  );
  const [pickerVisible, setPickerVisible] = useState(false);

  // Categoria e promoção só existem em produto que já foi salvo (a API só aceita esses campos no
  // PATCH, não na criação): a seção correspondente só aparece ao editar.
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

  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'name' | 'price' | 'cost' | 'stock' | 'promoPrice' | null>(null);

  if (isEditing && !existing) {
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

  async function pickImageFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permita o acesso à câmera',
        'Pra tirar uma foto, permita o acesso à câmera nas configurações do aparelho.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setLocalImage({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
    setImageTouched(true);
  }

  async function pickImageFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permita o acesso às fotos',
        'Pra escolher uma imagem, permita o acesso à galeria nas configurações do aparelho.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      // `MediaTypeOptions` está depreciado nessa versão do expo-image-picker: usa o array novo.
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setLocalImage({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
    setImageTouched(true);
  }

  function handleImageSourceSelect(source: string) {
    setImageSourceModalVisible(false);
    if (source === 'camera') void pickImageFromCamera();
    else void pickImageFromGallery();
  }

  function removeImage() {
    setLocalImage(null);
    setRemoteImage(null);
    setImageTouched(true);
  }

  function addComponent(item: StoreProduct) {
    setComponents((previous) => {
      if (previous.some((c) => c.storeProductId === item.id)) return previous;
      return [...previous, { storeProductId: item.id, name: item.product.name, image: item.product.productImageSm, quantity: 1 }];
    });
    setPickerVisible(false);
  }

  function removeComponent(storeProductId: string) {
    setComponents((previous) => previous.filter((c) => c.storeProductId !== storeProductId));
  }

  function stepComponentQuantity(storeProductId: string, delta: number) {
    setComponents((previous) =>
      previous.map((c) =>
        c.storeProductId === storeProductId ? { ...c, quantity: Math.min(9999, Math.max(1, c.quantity + delta)) } : c
      )
    );
  }

  function validatePrice(): number | null {
    if (!price.trim()) {
      setPriceError('Informe o preço de venda.');
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

  function handleStockChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 7);
    setStock(digits && Number(digits) > STOCK_MAX ? String(STOCK_MAX) : digits);
    if (stockError) setStockError(null);
  }

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
    const trimmedName = name.trim();
    const nameOk = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
    setNameError(nameOk ? null : NAME_ERROR);
    const priceValue = validatePrice();
    const costResult = validateCost();
    const stockValue = validateStock();
    const promoResult = validatePromo(priceValue ?? 0);
    if (!nameOk || priceValue === null || !costResult.ok || stockValue === null || !promoResult.ok) return;

    const trimmedDescription = description.trim();
    const componentsPayload = components.map((c) => ({ storeProductId: c.storeProductId, quantity: c.quantity }));

    void run(async () => {
      try {
        let imageForPayload: string | null | undefined;
        if (imageTouched) {
          if (localImage) {
            const uploaded = await uploadProductImage(localImage.uri, localImage.mimeType);
            imageForPayload = uploaded.url;
          } else {
            imageForPayload = null;
          }
        }

        if (existing) {
          const changes: StoreProductChanges = {};
          if (trimmedName !== existing.product.name) changes.name = trimmedName;
          if (trimmedDescription !== (existing.product.description ?? '')) changes.description = trimmedDescription || null;
          if (imageForPayload !== undefined) changes.image = imageForPayload;
          if (priceValue !== existing.price) changes.price = priceValue;
          if (costResult.value !== existing.costPrice) changes.costPrice = costResult.value;
          if (stockValue !== existing.stock) changes.stock = stockValue;
          if (isActive !== existing.isActive) changes.isActive = isActive;
          if (!sameComponents(components, existing.components.map((c) => ({ ...c })))) {
            changes.components = componentsPayload;
          }
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

          if (Object.keys(changes).length === 0) {
            navigation.goBack();
            return;
          }
          await update(existing.id, changes);
          navigation.goBack();
          return;
        }

        await addManual({
          name: trimmedName,
          description: trimmedDescription || null,
          image: imageForPayload ?? null,
          price: priceValue,
          costPrice: costResult.value,
          stock: stockValue,
          components: componentsPayload.length > 0 ? componentsPayload : undefined,
        });
        // Volta pro Estoque (topo da pilha): o produto novo já aparece no topo da lista, mostrando
        // que foi adicionado com sucesso.
        navigation.popToTop();
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  const imageUri = localImage?.uri ?? remoteImage;

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
            <Text className="text-lg font-extrabold text-ink-900">{isEditing ? 'Editar Produto' : 'Cadastro Manual'}</Text>
            <View className="w-10 h-10" />
          </View>

          {formError && <Banner type="error" message={formError} />}

          <View className="items-center mb-5">
            <Pressable
              onPress={() => setImageSourceModalVisible(true)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Escolher foto do produto"
            >
              <ProductImage
                uri={imageUri}
                resizeMode="cover"
                iconName="image-outline"
                iconSize={32}
                style={{ width: 120, height: 120, borderRadius: 20, backgroundColor: '#fff' }}
              />
              <View
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary-500 items-center justify-center"
                style={{ borderWidth: 3, borderColor: '#F5F6FA' }}
              >
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </Pressable>
            {imageUri && (
              <Pressable onPress={removeImage} disabled={loading} hitSlop={8} className="mt-2.5" accessibilityRole="button">
                <Text className="text-xs font-bold text-danger">Remover foto</Text>
              </Pressable>
            )}
          </View>

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Nome do produto</Text>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError(null);
            }}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            placeholder="Ex: Ursinho de pelúcia"
            placeholderTextColor="#8B8FA3"
            maxLength={NAME_MAX}
            editable={!loading}
            accessibilityLabel="Nome do produto"
            className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900"
            style={{ borderWidth: 1.5, borderColor: nameError ? '#E0453F' : focused === 'name' ? '#FF6B00' : 'transparent' }}
          />
          {nameError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {nameError}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Descrição (opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Uma frase curta sobre o produto..."
            placeholderTextColor="#8B8FA3"
            multiline
            numberOfLines={3}
            maxLength={DESCRIPTION_MAX}
            editable={!loading}
            accessibilityLabel="Descrição do produto"
            className="bg-white rounded-xl px-4 py-3 text-sm text-ink-900"
            style={{ minHeight: 76, textAlignVertical: 'top' }}
          />

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Preço de venda</Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-4 h-12"
            style={{ borderWidth: 1.5, borderColor: priceError ? '#E0453F' : focused === 'price' ? '#FF6B00' : 'transparent' }}
          >
            <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
            <TextInput
              value={price}
              onChangeText={(text) => {
                setPrice(maskPriceInput(text));
                if (priceError) setPriceError(null);
              }}
              onFocus={() => setFocused('price')}
              onBlur={() => setFocused(null)}
              placeholder="0,00"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              editable={!loading}
              accessibilityLabel="Preço de venda"
              className="flex-1 text-sm text-ink-900"
            />
          </View>
          {priceError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {priceError}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Preço de custo (opcional)</Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-4 h-12"
            style={{ borderWidth: 1.5, borderColor: costError ? '#E0453F' : focused === 'cost' ? '#FF6B00' : 'transparent' }}
          >
            <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
            <TextInput
              value={cost}
              onChangeText={(text) => {
                setCost(maskPriceInput(text));
                if (costError) setCostError(null);
              }}
              onFocus={() => setFocused('cost')}
              onBlur={() => setFocused(null)}
              placeholder="0,00"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              editable={!loading}
              accessibilityLabel="Preço de custo (opcional)"
              className="flex-1 text-sm text-ink-900"
            />
          </View>
          {costError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {costError}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">
            {isEditing ? 'Quantidade em estoque' : 'Quantidade em estoque (opcional)'}
          </Text>
          <View
            className="flex-row items-center bg-white rounded-xl px-1.5 h-12"
            style={{ borderWidth: 1.5, borderColor: stockError ? '#E0453F' : focused === 'stock' ? '#FF6B00' : 'transparent' }}
          >
            <Pressable
              onPress={() => stepStock(-1)}
              disabled={loading}
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
              onFocus={() => setFocused('stock')}
              onBlur={() => setFocused(null)}
              placeholder="0"
              placeholderTextColor="#8B8FA3"
              keyboardType="number-pad"
              maxLength={7}
              editable={!loading}
              accessibilityLabel={isEditing ? 'Quantidade em estoque' : 'Quantidade em estoque (opcional)'}
              className="flex-1 text-base font-bold text-ink-900 text-center"
            />
            <Pressable
              onPress={() => stepStock(1)}
              disabled={loading}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Aumentar estoque"
              className="w-9 h-9 rounded-full bg-primary-500 items-center justify-center"
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
          {stockError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {stockError}
            </Text>
          )}

          <View className="flex-row items-center justify-between mt-6 mb-2">
            <Text className="text-sm font-extrabold text-ink-900">O que vem junto (opcional)</Text>
            <Pressable
              onPress={() => setPickerVisible(true)}
              disabled={loading}
              accessibilityRole="button"
              className="flex-row items-center gap-1"
            >
              <Ionicons name="add-circle-outline" size={16} color="#FF6B00" />
              <Text className="text-xs font-bold text-primary-600">Adicionar produto</Text>
            </Pressable>
          </View>
          <Text className="text-xs text-ink-400 mb-2.5">
            Se esse produto é montado com outros itens do seu estoque (ex.: uma cesta), adicione-os aqui. Ao vender,
            o estoque de cada um é debitado junto.
          </Text>

          {components.length === 0 ? (
            <View className="bg-white rounded-2xl p-4 items-center">
              <Text className="text-xs text-ink-400">Nenhum produto adicionado.</Text>
            </View>
          ) : (
            <View className="bg-white rounded-2xl">
              {components.map((component, index) => (
                <View key={component.storeProductId}>
                  {index > 0 && <View style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }} />}
                  <View className="flex-row items-center px-3 py-2.5">
                    <ProductImage
                      uri={component.image}
                      resizeMode="cover"
                      iconName="cube"
                      style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }}
                    />
                    <Text className="flex-1 text-sm font-bold text-ink-900 pr-2" numberOfLines={1}>
                      {component.name}
                    </Text>
                    <View className="flex-row items-center bg-ink-50 rounded-full mr-2">
                      <Pressable
                        onPress={() => stepComponentQuantity(component.storeProductId, -1)}
                        disabled={loading}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Diminuir quantidade de ${component.name}`}
                        className="w-7 h-7 items-center justify-center"
                      >
                        <Ionicons name="remove" size={14} color="#3A3D4D" />
                      </Pressable>
                      <Text className="text-xs font-bold text-ink-900" style={{ minWidth: 20, textAlign: 'center' }}>
                        {component.quantity}
                      </Text>
                      <Pressable
                        onPress={() => stepComponentQuantity(component.storeProductId, 1)}
                        disabled={loading}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Aumentar quantidade de ${component.name}`}
                        className="w-7 h-7 items-center justify-center"
                      >
                        <Ionicons name="add" size={14} color="#3A3D4D" />
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => removeComponent(component.storeProductId)}
                      disabled={loading}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover ${component.name}`}
                    >
                      <Ionicons name="close-circle" size={20} color="#C7C9D9" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
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
                      borderColor: promoPriceError ? '#E0453F' : focused === 'promoPrice' ? '#FF6B00' : 'transparent',
                    }}
                  >
                    <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
                    <TextInput
                      value={promoPrice}
                      onChangeText={(text) => {
                        setPromoPrice(maskPriceInput(text));
                        if (promoPriceError) setPromoPriceError(null);
                      }}
                      onFocus={() => setFocused('promoPrice')}
                      onBlur={() => setFocused(null)}
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
            <PrimaryButton
              label={isEditing ? 'Salvar Alterações' : 'Cadastrar Produto'}
              onPress={handleSave}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ComponentPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        excludeIds={new Set([...components.map((c) => c.storeProductId), ...(existing ? [existing.id] : [])])}
        onSelect={addComponent}
      />

      <OptionsSheetModal
        visible={imageSourceModalVisible}
        title="Foto do produto"
        options={[
          { key: 'camera', label: 'Tirar foto' },
          { key: 'gallery', label: 'Escolher da galeria' },
        ]}
        onClose={() => setImageSourceModalVisible(false)}
        onSelect={handleImageSourceSelect}
      />

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
