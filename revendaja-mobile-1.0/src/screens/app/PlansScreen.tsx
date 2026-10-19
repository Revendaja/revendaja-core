import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { plans } from '../../data/plans';
import { queryKeys } from '../../api/queryKeys';
import { getStoreSettings } from '../../api/stores';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import type { MoreStackParamList } from '../../navigation/types';
import type { PlanId } from '../../types';

type Props = NativeStackScreenProps<MoreStackParamList, 'Plans'>;

const PLAN_ICON: Record<PlanId, keyof typeof Ionicons.glyphMap> = {
  free: 'pricetag-outline',
  starter: 'rocket-outline',
  premium: 'flash',
  business: 'briefcase-outline',
};

export default function PlansScreen({ navigation }: Props) {
  const guard = useStoreAccessGuard();
  // Mesma chamada/cache de MoreScreen (que já buscou isso antes da usuária chegar aqui): o plano
  // "atual" mostrado aqui é sempre o mesmo valor real da API, nunca um estado local que possa
  // divergir do que a tela Mais (ou Minha Assinatura) mostra pra mesma conta.
  const settingsQuery = useQuery({ queryKey: queryKeys.storeSettings(), queryFn: () => guard(() => getStoreSettings()) });
  const currentPlanId = settingsQuery.data?.plan.id ?? null;

  function handleChoosePlan(planId: PlanId) {
    if (planId === currentPlanId) return;

    const plan = plans.find((p) => p.id === planId)!;
    // Ainda não existe troca de plano pelo app (depende da cobrança/assinatura, ver
    // Store.plan no schema do backend) — avisa em vez de fingir que mudou algo.
    Alert.alert(
      `Assinar plano ${plan.name}`,
      'A troca de plano ainda não está disponível pelo app. Fale com o suporte para atualizar sua assinatura.',
      [{ text: 'Entendi' }]
    );
  }

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
          <Text className="text-lg font-extrabold text-ink-900">Planos</Text>
          <View className="w-10 h-10" />
        </View>

        <Text className="text-sm text-ink-500 mb-5">
          Escolha o plano que combina com o momento da sua revenda. Você pode trocar quando quiser.
        </Text>

        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <View
              key={plan.id}
              className={`rounded-2xl p-4 mb-4 ${plan.highlight ? 'bg-primary-500' : 'bg-white'}`}
              style={{ elevation: 1 }}
            >
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2">
                  <Ionicons
                    name={PLAN_ICON[plan.id]}
                    size={18}
                    color={plan.highlight ? '#fff' : '#FF6B00'}
                  />
                  <Text className={`text-base font-extrabold ${plan.highlight ? 'text-white' : 'text-ink-900'}`}>
                    {plan.name}
                  </Text>
                </View>
                {isCurrent && (
                  <View className={`rounded-full px-2.5 py-1 ${plan.highlight ? 'bg-white/20' : 'bg-success-bg'}`}>
                    <Text className={`text-[11px] font-bold ${plan.highlight ? 'text-white' : 'text-success'}`}>
                      Plano atual
                    </Text>
                  </View>
                )}
              </View>

              <Text className={`text-xs mb-3 ${plan.highlight ? 'text-white/80' : 'text-ink-500'}`}>
                {plan.tagline}
              </Text>

              <View className="flex-row items-end gap-1 mb-4">
                <Text className={`text-2xl font-extrabold ${plan.highlight ? 'text-white' : 'text-ink-900'}`}>
                  {plan.priceLabel}
                </Text>
                {!!plan.billingLabel && (
                  <Text className={`text-xs font-semibold mb-1 ${plan.highlight ? 'text-white/80' : 'text-ink-400'}`}>
                    {plan.billingLabel}
                  </Text>
                )}
              </View>

              {plan.features.map((feature) => (
                <View key={feature} className="flex-row items-center gap-2 mb-2">
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={plan.highlight ? '#fff' : '#1FAA59'}
                  />
                  <Text className={`text-xs flex-1 ${plan.highlight ? 'text-white/90' : 'text-ink-700'}`}>
                    {feature}
                  </Text>
                </View>
              ))}

              <Pressable
                disabled={isCurrent}
                onPress={() => handleChoosePlan(plan.id)}
                className={`rounded-xl items-center justify-center h-12 mt-3 ${
                  isCurrent ? (plan.highlight ? 'bg-white/20' : 'bg-ink-100') : plan.highlight ? 'bg-white' : 'bg-primary-500'
                }`}
              >
                <Text
                  className={`text-sm font-extrabold ${
                    isCurrent
                      ? plan.highlight
                        ? 'text-white'
                        : 'text-ink-500'
                      : plan.highlight
                      ? 'text-primary-600'
                      : 'text-white'
                  }`}
                >
                  {isCurrent ? 'Plano atual' : 'Assinar este plano'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
