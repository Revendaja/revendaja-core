import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SettingsRowsSkeleton } from '../../components/Skeleton';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { getStoreSettings, getStoreStats, updateStoreSettings } from '../../api/stores';
import type { NewSalePaymentMethod, StoreSettings, StoreSettingsChanges } from '../../api/types';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import {
  getPushPermissionStatus,
  registerPushToken,
  unregisterPushToken,
  type PushPermissionStatus,
} from '../../notifications/pushRegistration';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import { PAYMENT_CHIPS } from '../../utils/sales';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreHome'>;

export default function MoreScreen({ navigation }: Props) {
  const { user, store, logout } = useAuth();
  // Otimista até a checagem real (sem popup) responder, logo depois de montar.
  const [pushEnabled, setPushEnabled] = useState(true);
  // Simulador/emulador ou Expo Go: não tem como registrar push de verdade (ver pushRegistration.ts).
  const [pushUnsupported, setPushUnsupported] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);
  const guard = useStoreAccessGuard();
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void getPushPermissionStatus().then((status: PushPermissionStatus) => {
      if (!active) return;
      setPushUnsupported(status === 'unsupported');
      setPushEnabled(status === 'granted');
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleTogglePush(value: boolean) {
    setTogglingPush(true);
    try {
      if (value) {
        await registerPushToken();
        const status = await getPushPermissionStatus();
        setPushEnabled(status === 'granted');
        if (status !== 'granted') {
          Alert.alert(
            'Permissão necessária',
            'Ative as notificações para este app nas configurações do aparelho.',
            [
              { text: 'Agora não', style: 'cancel' },
              { text: 'Abrir configurações', onPress: () => void Linking.openSettings() },
            ]
          );
        }
      } else {
        await unregisterPushToken();
        setPushEnabled(false);
      }
    } finally {
      setTogglingPush(false);
    }
  }

  // Já vem prefetchado (RootNavigator, no topo do app): a aba Mais abre sem skeleton na primeira
  // visita. useRefetchOnFocus só atualiza em silêncio ao voltar pra aba (mantém o que já está na tela).
  const settingsQuery = useQuery({ queryKey: queryKeys.storeSettings(), queryFn: () => guard(() => getStoreSettings()) });
  const settings = settingsQuery.data ?? null;

  // Pedidos feitos pelos clientes na vitrine (compartilha o cache com a tela "Minha Loja").
  const statsQuery = useQuery({ queryKey: queryKeys.storeStats(), queryFn: () => guard(() => getStoreStats()) });
  const ordersCount = statsQuery.data?.ordersCount ?? null;

  useRefetchOnFocus(queryKeys.storeSettings());
  useRefetchOnFocus(queryKeys.storeStats());

  // Atualização otimista (troca na hora, volta ao valor anterior se a API recusar) — mesmo
  // comportamento de antes, agora via `onMutate`/`onError` do TanStack Query.
  const updateSettingsMutation = useMutation({
    mutationFn: (changes: StoreSettingsChanges) => guard(() => updateStoreSettings(changes)),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.storeSettings() });
      const previous = queryClient.getQueryData<StoreSettings>(queryKeys.storeSettings());
      if (previous) queryClient.setQueryData(queryKeys.storeSettings(), { ...previous, ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.storeSettings(), context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.storeSettings(), saved);
    },
  });
  const saving = updateSettingsMutation.isPending;

  async function save(changes: StoreSettingsChanges) {
    try {
      await updateSettingsMutation.mutateAsync(changes);
    } catch (error) {
      // O switch já voltou ao valor anterior; só avisa o motivo.
      Alert.alert('Ops!', getErrorMessage(error));
    }
  }

  function toggleMethod(method: NewSalePaymentMethod) {
    if (!settings) return;
    const accepted = settings.acceptedPaymentMethods;
    if (!accepted.includes(method)) {
      void save({ acceptedPaymentMethods: [...accepted, method] });
      return;
    }
    // A vitrine precisa aceitar ao menos uma forma de pagamento: a última não desliga.
    if (accepted.length === 1) return;
    void save({ acceptedPaymentMethods: accepted.filter((m) => m !== method) });
  }

  function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="text-2xl font-extrabold text-ink-900 mb-4">Mais</Text>

        <Pressable
          className="flex-row items-center bg-white rounded-2xl p-4 mb-4"
          style={{ elevation: 1 }}
          onPress={() => navigation.navigate('Account')}
        >
          <View className="w-14 h-14 rounded-full bg-primary-500 items-center justify-center mr-3">
            <Text className="text-white font-bold text-xl">{(user?.name ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-base font-extrabold text-ink-900">{user?.name}</Text>
            <Text className="text-xs text-ink-500 mt-0.5" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
        </Pressable>

        <Pressable
          className="bg-white rounded-2xl p-4 mb-4"
          style={{ elevation: 1 }}
          onPress={() => navigation.navigate('Subscription')}
        >
          <View className="flex-row items-center gap-1.5 mb-1">
            <Ionicons name="ribbon-outline" size={16} color="#FF6B00" />
            <Text className="text-sm text-ink-500">Sua assinatura</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-extrabold text-ink-900">
                {settings ? `Plano ${settings.plan.name}` : 'Seu plano'}
              </Text>
              {settings && (
                <Text className="text-xs text-ink-400 mt-0.5">
                  {settings.plan.id === 'free' ? 'Grátis' : 'Ver detalhes da assinatura'}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
          </View>
        </Pressable>

        <Text className="text-xs font-extrabold text-ink-400 uppercase mb-2 mt-1">Loja</Text>
        <View className="bg-white rounded-2xl mb-4" style={{ elevation: 1 }}>
          <Pressable
            className="flex-row items-center px-4 py-3.5"
            onPress={() => navigation.navigate('StoreHome')}
          >
            <View className="w-9 h-9 rounded-xl bg-success-bg items-center justify-center mr-3">
              <Ionicons name="link-outline" size={17} color="#1FAA59" />
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold text-ink-900">Link Minha Loja</Text>
              <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
                {store?.handle} • {store?.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
          </Pressable>

          <View style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }} />

          <Pressable
            className="flex-row items-center px-4 py-3.5"
            onPress={() => navigation.navigate('EditStore')}
          >
            <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center mr-3">
              <Ionicons name="create-outline" size={17} color="#FF6B00" />
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold text-ink-900">Editar Loja</Text>
              <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
                Nome, link da vitrine e descrição
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
          </Pressable>

          <View style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }} />

          <Pressable
            className="flex-row items-center px-4 py-3.5"
            onPress={() => navigation.navigate('OnlineSales')}
          >
            <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center mr-3">
              <Ionicons name="receipt-outline" size={17} color="#FF6B00" />
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold text-ink-900">Vendas Recentes</Text>
              <Text className="text-xs text-ink-400 mt-0.5" numberOfLines={1}>
                {ordersCount === null
                  ? 'Pedidos pela vitrine'
                  : `${ordersCount} ${ordersCount === 1 ? 'pedido' : 'pedidos'} pela vitrine`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8D9F" />
          </Pressable>
        </View>

        <Text className="text-xs font-extrabold text-ink-400 uppercase mb-2 mt-1">Ações da Loja</Text>
        <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
          {settings ? (
            <>
              {PAYMENT_CHIPS.map(({ method, label }, index) => (
                <View
                  key={method}
                  className="flex-row items-center justify-between py-2.5"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#F5F6FA' } : undefined}
                >
                  <Text className="text-sm font-bold text-ink-900">Aceitar {label}</Text>
                  <Switch
                    value={settings.acceptedPaymentMethods.includes(method)}
                    onValueChange={() => toggleMethod(method)}
                    disabled={saving}
                    accessibilityLabel={`Aceitar ${label}`}
                    trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
                    thumbColor="#fff"
                  />
                </View>
              ))}

              <View
                className="flex-row items-center justify-between py-2.5"
                style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-ink-900">Ocultar produtos sem estoque</Text>
                  <Text className="text-xs text-ink-400 mt-0.5">Some da vitrine quando o estoque zerar</Text>
                </View>
                <Switch
                  value={settings.hideOutOfStock}
                  onValueChange={(value) => void save({ hideOutOfStock: value })}
                  disabled={saving}
                  accessibilityLabel="Ocultar produtos sem estoque"
                  trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
                  thumbColor="#fff"
                />
              </View>
            </>
          ) : settingsQuery.isError ? (
            <Pressable onPress={() => void settingsQuery.refetch()} accessibilityRole="button" className="py-3">
              <Text className="text-sm text-ink-400">
                Não foi possível carregar as configurações. <Text className="font-bold text-primary-500">Tentar novamente</Text>
              </Text>
            </Pressable>
          ) : (
            <SettingsRowsSkeleton />
          )}
        </View>

        <Text className="text-xs font-extrabold text-ink-400 uppercase mb-2 mt-1">Preferências</Text>
        <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold text-ink-900">Notificações push</Text>
              <Text className="text-xs text-ink-400 mt-0.5">
                {pushUnsupported
                  ? 'Não disponível neste aparelho/ambiente'
                  : 'Vendas, pedidos e avisos de estoque'}
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(value) => void handleTogglePush(value)}
              disabled={pushUnsupported || togglingPush}
              accessibilityLabel="Notificações push"
              trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text className="text-xs font-extrabold text-ink-400 uppercase mb-2 mt-1">Sobre</Text>
        <View className="bg-white rounded-2xl px-4 mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center justify-between py-3.5">
            <Text className="text-sm font-semibold text-ink-900">Versão do app</Text>
            <Text className="text-xs text-ink-400">1.0.0</Text>
          </View>
        </View>

        <Pressable
          className="flex-row items-center justify-center bg-white rounded-2xl h-12"
          style={{ elevation: 1 }}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={18} color="#E0453F" />
          <Text className="text-danger text-sm font-bold ml-2">Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
