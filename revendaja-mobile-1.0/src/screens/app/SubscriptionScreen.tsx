import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { plans } from '../../data/plans';
import { billingInfo, paymentHistory } from '../../data/subscription';
import { queryKeys } from '../../api/queryKeys';
import { getStoreSettings } from '../../api/stores';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import type { MoreStackParamList } from '../../navigation/types';
import type { SubscriptionPaymentStatus } from '../../types';

type Props = NativeStackScreenProps<MoreStackParamList, 'Subscription'>;

const PAYMENT_STATUS_STYLE: Record<SubscriptionPaymentStatus, { bg: string; text: string }> = {
  Pago: { bg: 'bg-success-bg', text: 'text-success' },
  Falhou: { bg: 'bg-danger-bg', text: 'text-danger' },
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function SubscriptionScreen({ navigation }: Props) {
  const guard = useStoreAccessGuard();
  // Mesma fonte de MoreScreen/PlansScreen: nunca mostra um plano "atual" diferente do resto do app
  // pra mesma conta (ver bug corrigido: essa tela lia de um mock que nunca era sincronizado).
  const settingsQuery = useQuery({ queryKey: queryKeys.storeSettings(), queryFn: () => guard(() => getStoreSettings()) });
  const currentPlan = plans.find((p) => p.id === settingsQuery.data?.plan.id) ?? plans[0];
  const isPaidPlan = !!currentPlan.billingLabel;

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between mb-5">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-lg font-extrabold text-ink-900">Minha Assinatura</Text>
          <View className="w-10 h-10" />
        </View>

        <View className="bg-primary-500 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-white/80">Plano atual</Text>
              <Text className="text-2xl font-extrabold text-white mt-0.5">{currentPlan.name}</Text>
              <Text className="text-sm text-white/90 mt-0.5">
                {currentPlan.priceLabel}
                {currentPlan.billingLabel}
              </Text>
            </View>
            <Pressable
              className="bg-white rounded-full px-3.5 py-2"
              onPress={() => navigation.navigate('Plans')}
            >
              <Text className="text-primary-600 text-xs font-bold">Trocar plano</Text>
            </Pressable>
          </View>
        </View>

        {isPaidPlan ? (
          <View className="flex-row mb-4" style={{ gap: 12 }}>
            <View className="flex-1 bg-white rounded-2xl p-4" style={{ elevation: 1 }}>
              <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center mb-2.5">
                <Ionicons name="calendar-outline" size={17} color="#FF6B00" />
              </View>
              <Text className="text-xs text-ink-500">Próximo pagamento</Text>
              <Text className="text-sm font-extrabold text-ink-900 mt-0.5">
                {formatDate(billingInfo.nextPaymentDate)}
              </Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4" style={{ elevation: 1 }}>
              <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center mb-2.5">
                <Ionicons name="card-outline" size={17} color="#FF6B00" />
              </View>
              <Text className="text-xs text-ink-500">{billingInfo.cardBrand}</Text>
              <Text className="text-sm font-extrabold text-ink-900 mt-0.5">•••• {billingInfo.cardLast4}</Text>
            </View>
          </View>
        ) : (
          <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
            <Text className="text-sm text-ink-500 leading-5">
              Você está no plano gratuito. Assine um plano pago para desbloquear mais recursos da sua loja.
            </Text>
          </View>
        )}

        <Text className="text-lg font-extrabold text-ink-900 mb-3">Histórico de pagamentos</Text>

        {paymentHistory.length === 0 && (
          <Text className="text-sm text-ink-500">Nenhum pagamento registrado ainda.</Text>
        )}

        {paymentHistory.map((payment) => {
          const statusStyle = PAYMENT_STATUS_STYLE[payment.status];
          return (
            <View key={payment.id} className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
              <View className="w-10 h-10 rounded-xl bg-primary-50 items-center justify-center mr-3">
                <Ionicons name="receipt-outline" size={18} color="#FF6B00" />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-ink-900">Plano {payment.planName}</Text>
                <Text className="text-xs text-ink-500 mt-0.5">{formatDate(payment.date)}</Text>
              </View>
              <View className="items-end gap-1">
                <Text className="text-sm font-bold text-ink-900">{formatCurrency(payment.amount)}</Text>
                <View className={`rounded-lg px-2 py-0.5 ${statusStyle.bg}`}>
                  <Text className={`text-[11px] font-bold ${statusStyle.text}`}>{payment.status}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
