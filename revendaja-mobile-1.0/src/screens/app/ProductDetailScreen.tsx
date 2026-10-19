import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ProductImage from '../../components/ProductImage';
import { getErrorMessage, isApiError } from '../../api/errors';
import type { StoreProduct } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useSubmitting } from '../../hooks/useSubmitting';
import { formatCurrency, hasSuggestedPrice } from '../../utils/format';
import type { EstoqueStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<EstoqueStackParamList, 'ProductDetail'>;

const DESCRIPTION_COLLAPSED_LINES = 4;
const DESCRIPTION_LONG_THRESHOLD = 180;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <Text className="text-sm text-ink-500">{label}</Text>
      <Text className="text-sm font-bold text-ink-900 ml-4 flex-shrink" numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function ProductDetailScreen({ route, navigation }: Props) {
  const { findById, update, remove, refresh } = useStoreProducts();
  const { store } = useAuth();
  const removing = useSubmitting();
  const [togglePending, setTogglePending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Ao remover, o item some da lista antes da tela fechar: mantém o último conteúdo para não piscar "não encontrado".
  const [gone, setGone] = useState(false);

  const current = findById(route.params.storeProductId);
  const lastItem = useRef<StoreProduct | undefined>(undefined);
  if (current) lastItem.current = current;
  const item = current ?? (gone ? lastItem.current : undefined);

  if (!item) {
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

  const { product } = item;
  const description = product.description?.trim() ?? '';
  const isLongDescription = description.length > DESCRIPTION_LONG_THRESHOLD;

  // SKU e código de barras só aparecem quando existem (~40% dos produtos não têm código de barras).
  const detailRows: { label: string; value: string }[] = [
    { label: 'Em estoque', value: item.stock === 0 ? 'Esgotado' : `${item.stock} un` },
  ];
  // Custo só aparece quando foi informado (null = não informado; 0 é um custo válido).
  if (item.costPrice !== null) detailRows.push({ label: 'Preço de custo', value: formatCurrency(item.costPrice) });
  if (product.brandSku) detailRows.push({ label: 'Código da marca (SKU)', value: product.brandSku });
  if (product.barCode) detailRows.push({ label: 'Código de barras', value: product.barCode });

  // 404 "Produto não encontrado na sua loja.": ele já não existe mais; atualiza a lista e volta.
  function handleGone(error: unknown) {
    Alert.alert('Ops!', getErrorMessage(error));
    void refresh();
    navigation.goBack();
  }

  async function handleToggleVisibility(next: boolean) {
    if (togglePending) return;
    setTogglePending(true);
    try {
      await update(item!.id, { isActive: next });
    } catch (error) {
      if (isApiError(error) && error.status === 404) handleGone(error);
      else Alert.alert('Ops!', getErrorMessage(error));
    } finally {
      setTogglePending(false);
    }
  }

  async function handleShare() {
    const current = item!;
    const displayPrice = current.isPromoActive && current.promoPrice !== null ? current.promoPrice : current.price;
    const priceLine = current.isPromoActive
      ? `${formatCurrency(displayPrice)} (promoção, de ${formatCurrency(current.price)})`
      : formatCurrency(displayPrice);
    const link = store?.catalogLink;
    const message = `Confira ${product.name} por ${priceLine} na minha loja${link ? `: ${link}` : '!'}`;
    try {
      await Share.share({ message });
    } catch {
      // Fechar/cancelar o share sheet não é erro.
    }
  }

  function confirmRemove() {
    Alert.alert(
      'Remover produto',
      `Remover "${product.name}" da sua loja? Ele continua no catálogo e pode ser adicionado de novo depois.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => void handleRemove() },
      ]
    );
  }

  async function handleRemove() {
    await removing.run(async () => {
      setGone(true);
      try {
        await remove(item!.id);
        navigation.goBack();
      } catch (error) {
        setGone(false);
        if (isApiError(error) && error.status === 404) handleGone(error);
        else Alert.alert('Ops!', getErrorMessage(error));
      }
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => void handleShare()}
              accessibilityRole="button"
              accessibilityLabel="Compartilhar produto no WhatsApp"
              className="w-10 h-10 rounded-full bg-white items-center justify-center"
            >
              <Ionicons name="share-social-outline" size={18} color="#FF6B00" />
            </Pressable>
            <Pressable
              className="flex-row items-center gap-1.5 bg-white rounded-full pl-3 pr-4 py-2.5"
              onPress={() =>
                item.kind === 'manual'
                  ? navigation.navigate('ManualProductForm', { storeProductId: item.id })
                  : navigation.navigate('ProductForm', { storeProductId: item.id })
              }
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={16} color="#FF6B00" />
              <Text className="text-primary-600 text-xs font-bold">{item.kind === 'manual' ? 'Editar produto' : 'Editar preço'}</Text>
            </Pressable>
          </View>
        </View>

        <ProductImage
          uri={product.productImage ?? product.productImageSm}
          style={{ height: 200, borderRadius: 20, backgroundColor: '#fff', marginBottom: 20 }}
          iconSize={56}
        />

        <Text className="text-xs text-primary-600 font-extrabold uppercase">{product.brand.name}</Text>
        <Text className="text-2xl font-extrabold text-ink-900 mt-1">{product.name}</Text>
        <View className="flex-row items-center mt-2 flex-wrap">
          {item.isPromoActive && item.promoPrice !== null ? (
            <>
              <Text className="text-xl font-extrabold text-danger">{formatCurrency(item.promoPrice)}</Text>
              <Text className="text-sm text-ink-400 line-through ml-2">{formatCurrency(item.price)}</Text>
              <View className="bg-danger rounded-full px-2 py-0.5 ml-2.5">
                <Text className="text-white text-[10px] font-bold">PROMOÇÃO</Text>
              </View>
            </>
          ) : (
            <Text className="text-xl font-extrabold text-ink-900">{formatCurrency(item.price)}</Text>
          )}
          {item.isFrozen ? (
            <View className="bg-danger-bg rounded-full px-2 py-0.5 ml-2.5">
              <Text className="text-danger text-[10px] font-bold">CONGELADO</Text>
            </View>
          ) : (
            !item.isActive && (
              <View className="bg-warning-bg rounded-full px-2 py-0.5 ml-2.5">
                <Text className="text-warning text-[10px] font-bold">OCULTO</Text>
              </View>
            )
          )}
        </View>
        {item.isFrozen && (
          <Text className="text-xs text-ink-500 mt-1.5">
            Este produto passa do limite do seu plano e está fora da vitrine. Você pode apagá-lo; ele volta se você
            apagar outros produtos ou fizer upgrade.
          </Text>
        )}
        {item.isPromoActive && item.promoEndsAt && (
          <Text className="text-xs text-ink-400 mt-1.5">
            Promoção válida até{' '}
            {new Date(item.promoEndsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
        )}

        {!!description && (
          <View className="mt-3.5">
            <Text
              className="text-sm text-ink-500 leading-5"
              numberOfLines={expanded ? undefined : DESCRIPTION_COLLAPSED_LINES}
            >
              {description}
            </Text>
            {isLongDescription && (
              <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={8} accessibilityRole="button">
                <Text className="text-sm font-bold text-primary-500 mt-1.5">{expanded ? 'Ver menos' : 'Ver mais'}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="flex-row gap-2.5 mt-5">
          <View className="flex-1 bg-white rounded-2xl p-3.5 items-center gap-1">
            <Ionicons name="pricetag-outline" size={18} color="#FF6B00" />
            <Text className="text-[15px] font-extrabold text-ink-900">
              {formatCurrency(item.isPromoActive && item.promoPrice !== null ? item.promoPrice : item.price)}
            </Text>
            <Text className="text-[11px] text-ink-500 text-center">{item.isPromoActive ? 'Preço promocional' : 'Seu preço'}</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-3.5 items-center gap-1">
            <Ionicons name="bookmark-outline" size={18} color="#8B8FA3" />
            <Text className="text-[15px] font-extrabold text-ink-900">
              {hasSuggestedPrice(product.basePrice) ? formatCurrency(product.basePrice) : '—'}
            </Text>
            <Text className="text-[11px] text-ink-500 text-center">
              {hasSuggestedPrice(product.basePrice) ? 'Sugerido pelo catálogo' : 'Sem preço sugerido'}
            </Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-3.5 items-center gap-1">
            <Ionicons
              name={item.isActive ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={item.isActive ? '#1FAA59' : '#8B8FA3'}
            />
            <Text className={`text-[15px] font-extrabold ${item.isActive ? 'text-success' : 'text-ink-500'}`}>
              {item.isActive ? 'Visível' : 'Oculto'}
            </Text>
            <Text className="text-[11px] text-ink-500 text-center">Na vitrine</Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl px-4 py-3 mt-4 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-ink-900">Visível na vitrine</Text>
            <Text className="text-xs text-ink-400 mt-0.5">Escondido, ele sai da vitrine mas mantém o seu preço</Text>
          </View>
          <Switch
            value={item.isActive}
            onValueChange={handleToggleVisibility}
            disabled={togglePending || removing.loading}
            trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
            thumbColor="#fff"
            accessibilityLabel="Mostrar produto na vitrine"
          />
        </View>

        {detailRows.length > 0 && (
          <View className="bg-white rounded-2xl px-4 mt-4">
            {detailRows.map((row, index) => (
              <React.Fragment key={row.label}>
                {index > 0 && <View className="h-px bg-ink-50" />}
                <DetailRow label={row.label} value={row.value} />
              </React.Fragment>
            ))}
          </View>
        )}

        {item.components.length > 0 && (
          <View className="mt-4">
            <Text className="text-xs font-extrabold text-ink-400 uppercase mb-2">Contém</Text>
            <View className="bg-white rounded-2xl px-4">
              {item.components.map((component, index) => (
                <React.Fragment key={component.id}>
                  {index > 0 && <View className="h-px bg-ink-50" />}
                  <View className="flex-row items-center justify-between py-3">
                    <Text className="text-sm text-ink-500 flex-1 pr-2" numberOfLines={1}>
                      {component.quantity}x {component.name}
                    </Text>
                    <Text className="text-xs text-ink-400">{component.stock} em estoque</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        <Pressable
          onPress={confirmRemove}
          disabled={removing.loading}
          accessibilityRole="button"
          className="flex-row items-center justify-center bg-white rounded-2xl h-12 mt-6"
          style={{ elevation: 1, opacity: removing.loading ? 0.6 : 1 }}
        >
          <Ionicons name="trash-outline" size={18} color="#E0453F" />
          <Text className="text-danger text-sm font-bold ml-2">
            {removing.loading ? 'Removendo...' : 'Remover da loja'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
