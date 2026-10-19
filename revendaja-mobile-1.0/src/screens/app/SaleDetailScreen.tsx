import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ProductImage from '../../components/ProductImage';
import { ErrorState } from '../../components/ListStates';
import { SaleDetailSkeleton } from '../../components/Skeleton';
import { cancelSale, getSale, markSalePaid } from '../../api/sales';
import { getErrorMessage, isApiError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import type { SaleDetail, SaleStatusValue } from '../../api/types';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreProducts } from '../../products/StoreProductsContext';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { formatCurrency, formatWhatsapp, whatsappUrl } from '../../utils/format';
import { formatDateFull, formatTime, PAYMENT_ICON, paymentLabel } from '../../utils/sales';

// Serve a duas pilhas (Finanças e Mais > Vendas Recentes): só precisa do id da venda e de "voltar".
type Props = { route: { params: { saleId: string } }; navigation: { goBack: () => void } };

const STATUS_STYLE: Record<SaleStatusValue, { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-success-bg', text: 'text-success', label: 'Recebido' },
  pending: { bg: 'bg-warning-bg', text: 'text-warning', label: 'A receber' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-500', label: 'Cancelado' },
};

export default function SaleDetailScreen({ route, navigation }: Props) {
  const { saleId } = route.params;
  const guard = useStoreAccessGuard();
  const queryClient = useQueryClient();
  const { applyStockDelta } = useStoreProducts();
  const paying = useSubmitting();
  const cancelling = useSubmitting();

  const saleQuery = useQuery({
    queryKey: queryKeys.sales.detail(saleId),
    queryFn: () => guard(() => getSale(saleId)),
    // 404 "Venda não encontrada." (não existe ou é de outra loja) não adianta tentar de novo sozinho.
    retry: (failureCount, error) => !isApiError(error) && failureCount < 1,
  });

  // Pagar/cancelar mudam o total "a receber": invalida o resumo e a lista de Finanças (e a Início,
  // que também mostra faturamento) pra refletirem sem precisar sair e voltar da tela.
  function invalidateAfterChange(updated: SaleDetail) {
    queryClient.setQueryData(queryKeys.sales.detail(saleId), updated);
    void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
  }

  const markPaidMutation = useMutation({
    mutationFn: () => guard(() => markSalePaid(saleId)),
    onSuccess: invalidateAfterChange,
  });

  const cancelMutation = useMutation({
    mutationFn: () => guard(() => cancelSale(saleId)),
    onSuccess: invalidateAfterChange,
  });

  const backButton = (
    <Pressable
      className="w-10 h-10 rounded-full bg-white items-center justify-center"
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
    >
      <Ionicons name="arrow-back" size={22} color="#1A1B25" />
    </Pressable>
  );

  if (!saleQuery.data) {
    const notFound = saleQuery.isError && isApiError(saleQuery.error) && saleQuery.error.status === 404;
    return (
      <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
        <View className="p-5">{backButton}</View>
        {saleQuery.isPending && (
          <View className="px-5">
            <SaleDetailSkeleton />
          </View>
        )}
        {saleQuery.isError && !notFound && (
          <ErrorState message={getErrorMessage(saleQuery.error)} onRetry={() => void saleQuery.refetch()} />
        )}
        {notFound && <Text className="text-center text-ink-500 mt-10">{getErrorMessage(saleQuery.error)}</Text>}
      </SafeAreaView>
    );
  }

  const sale = saleQuery.data;
  const statusStyle = STATUS_STYLE[sale.status];
  const isPending = sale.status === 'pending';

  function handleMarkAsPaid() {
    void paying.run(async () => {
      try {
        // Só `pending` vira `paid`. A resposta é a venda completa e atualizada.
        await markPaidMutation.mutateAsync();
      } catch (error) {
        Alert.alert('Ops!', getErrorMessage(error));
      }
    });
  }

  function handleCancel() {
    Alert.alert('Cancelar este pedido?', 'O estoque reservado volta para a sua loja. Isso não pode ser desfeito.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar pedido',
        style: 'destructive',
        onPress: () => {
          void cancelling.run(async () => {
            try {
              await cancelMutation.mutateAsync();
              // O servidor devolveu o estoque: a lista de produtos do app acompanha (quantidade negativa = volta).
              applyStockDelta(
                sale.items.flatMap((item) =>
                  item.storeProductId ? [{ storeProductId: item.storeProductId, quantity: -item.quantity }] : []
                )
              );
            } catch (error) {
              Alert.alert('Ops!', getErrorMessage(error));
            }
          });
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between mb-4">
          {backButton}
          <View className={`rounded-full px-3 py-1.5 ${statusStyle.bg}`}>
            <Text className={`text-xs font-extrabold ${statusStyle.text}`}>{statusStyle.label}</Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-4 mb-3" style={{ elevation: 1 }}>
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-full items-center justify-center mr-3 bg-primary-500">
              <Text className="text-white font-bold text-base">{sale.customerName.charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-ink-900" numberOfLines={1}>
                {sale.customerName}
              </Text>
              <Text className="text-xs text-ink-400 mt-0.5">
                Venda #{sale.number} · {formatDateFull(sale.createdAt)} às {formatTime(sale.createdAt)}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-2 bg-white rounded-xl p-3 mb-4">
          <View className="w-8 h-8 rounded-lg bg-primary-50 items-center justify-center">
            <Ionicons name={PAYMENT_ICON[sale.paymentMethod]} size={16} color="#FF6B00" />
          </View>
          <Text className="text-xs font-bold text-ink-700">{paymentLabel(sale.paymentMethod, sale.installments)}</Text>
        </View>

        {sale.source === 'online' && (
          <View className="flex-row items-center gap-2 bg-white rounded-xl p-3 mb-4">
            <View className="w-8 h-8 rounded-lg bg-primary-50 items-center justify-center">
              <Ionicons name="storefront-outline" size={16} color="#FF6B00" />
            </View>
            <Text className="text-xs font-bold text-ink-700">Pedido feito pela loja online</Text>
          </View>
        )}

        {sale.customerWhatsapp && (
          <Pressable
            className="flex-row items-center bg-white rounded-xl p-3 mb-4"
            onPress={() => {
              Linking.openURL(whatsappUrl(sale.customerWhatsapp ?? '')).catch(() =>
                Alert.alert('Ops!', 'Não foi possível abrir o WhatsApp.')
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Falar com o cliente no WhatsApp"
          >
            <View className="w-8 h-8 rounded-lg bg-success-bg items-center justify-center mr-2">
              <Ionicons name="logo-whatsapp" size={16} color="#1FAA59" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-ink-700">Falar com o cliente</Text>
              <Text className="text-xs text-ink-400 mt-0.5">{formatWhatsapp(sale.customerWhatsapp)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8A8D9F" />
          </Pressable>
        )}

        <Text className="text-lg font-extrabold text-ink-900 mb-3">Itens ({sale.items.length})</Text>

        {/* Nome, imagem e preço são os da época da venda: continuam aqui mesmo se o produto sair da loja. */}
        {sale.items.map((item, index) => (
          <View key={`${item.storeProductId ?? 'removido'}-${index}`} className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
            <ProductImage
              uri={item.productImageSm}
              resizeMode="cover"
              iconName="cube-outline"
              iconSize={20}
              iconColor="#FF6B00"
              style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12 }}
            />
            <View className="flex-1 pr-2">
              <Text className="text-sm font-semibold text-ink-900" numberOfLines={1}>
                {item.productName}
              </Text>
              <Text className="text-xs text-ink-500 mt-0.5">
                {item.quantity}x {formatCurrency(item.unitPrice)}
              </Text>
            </View>
            <Text className="text-sm font-extrabold text-ink-900">{formatCurrency(item.subtotal)}</Text>
          </View>
        ))}

        <View
          className={`flex-row items-center justify-between rounded-2xl px-5 py-5 mt-3 ${
            sale.status === 'paid' ? 'bg-success' : sale.status === 'cancelled' ? 'bg-ink-400' : 'bg-warning'
          }`}
        >
          <Text className="text-sm font-semibold text-white/85">Total da venda</Text>
          <Text className="text-xl font-extrabold text-white">{formatCurrency(sale.total)}</Text>
        </View>

        {isPending && (
          <Pressable
            className="flex-row items-center justify-center gap-1.5 border border-primary-500 rounded-2xl h-12 mt-3"
            onPress={handleMarkAsPaid}
            disabled={paying.loading || cancelling.loading}
            accessibilityRole="button"
            style={{ opacity: paying.loading || cancelling.loading ? 0.6 : 1 }}
          >
            {paying.loading ? (
              <ActivityIndicator color="#FF6B00" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FF6B00" />
                <Text className="text-primary-600 font-extrabold text-sm">Marcar como recebido</Text>
              </>
            )}
          </Pressable>
        )}

        {isPending && (
          <Pressable
            className="flex-row items-center justify-center gap-1.5 rounded-2xl h-12 mt-2"
            onPress={handleCancel}
            disabled={paying.loading || cancelling.loading}
            accessibilityRole="button"
            style={{ opacity: paying.loading || cancelling.loading ? 0.6 : 1 }}
          >
            {cancelling.loading ? (
              <ActivityIndicator color="#E0453F" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color="#E0453F" />
                <Text className="text-danger font-bold text-sm">Cancelar pedido</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
