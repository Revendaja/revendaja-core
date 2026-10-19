import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { getStoreStats, setStoreOnline } from '../../api/stores';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'StoreHome'>;

export default function StoreScreen({ navigation }: Props) {
  const { store, applyStore } = useAuth();
  const guard = useStoreAccessGuard();
  const { loading: savingOnline, run } = useSubmitting();
  const [isStoreOnline, setIsStoreOnline] = useState(store?.isOnline ?? true);
  const [linkCopied, setLinkCopied] = useState(false);

  // Visitas e pedidos (compartilha o cache com a tela Mais, que também mostra a contagem de pedidos).
  const statsQuery = useQuery({ queryKey: queryKeys.storeStats(), queryFn: () => guard(() => getStoreStats()) });
  const stats = statsQuery.data ?? null;
  useRefetchOnFocus(queryKeys.storeStats());

  // O switch responde na hora e volta ao valor anterior (com o motivo) se a API recusar.
  function handleToggleOnline(value: boolean) {
    const previous = isStoreOnline;
    setIsStoreOnline(value);
    void run(async () => {
      try {
        const updated = await guard(() => setStoreOnline(value));
        // Mantém a sessão (e o "Online/Offline" da aba Mais) em sincronia com o que o servidor gravou.
        applyStore(updated);
        setIsStoreOnline(updated.isOnline);
      } catch (error) {
        setIsStoreOnline(previous);
        Alert.alert('Ops!', getErrorMessage(error));
      }
    });
  }

  function copyLink() {
    if (!store) return;
    Clipboard.setStringAsync(store.catalogLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-lg font-extrabold text-ink-900">Minha Loja</Text>
          <View className="w-10 h-10" />
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center">
            <View className="w-11 h-11 rounded-xl bg-success-bg items-center justify-center mr-3">
              <Ionicons name="storefront" size={20} color="#1FAA59" />
            </View>
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-sm font-extrabold text-ink-900">
                  {isStoreOnline ? 'Loja Online Ativa' : 'Loja Offline'}
                </Text>
                {isStoreOnline && <View className="w-1.5 h-1.5 rounded-full bg-success" />}
              </View>
              <Text className="text-xs text-ink-500 mt-0.5">
                {isStoreOnline ? 'Suas clientes podem comprar 24/7' : 'Ative para voltar a receber pedidos'}
              </Text>
            </View>
            <Switch
              value={isStoreOnline}
              onValueChange={handleToggleOnline}
              disabled={savingOnline}
              accessibilityLabel="Loja online"
              trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] font-extrabold text-primary-600 uppercase">
              Link da Vitrine Virtual
            </Text>
            <Pressable
              className="flex-row items-center gap-1 bg-ink-50 rounded-full px-2.5 py-1.5"
              onPress={() => store && Linking.openURL(store.catalogLink)}
              accessibilityRole="button"
              accessibilityLabel="Ver a vitrine como cliente"
            >
              <Ionicons name="eye-outline" size={14} color="#3A3D4D" />
              <Text className="text-ink-700 text-xs font-bold">Ver como cliente</Text>
            </Pressable>
          </View>

          <Text className="text-xs text-ink-400">{store?.storeName}</Text>
          <Text className="text-lg font-extrabold text-ink-900 mb-1">{store?.handle}</Text>

          {!!store?.bio && (
            <Text className="text-xs text-ink-500 mb-3" numberOfLines={2}>
              {store.bio}
            </Text>
          )}

          <View className="bg-ink-50 rounded-xl px-3 py-2.5 flex-row items-center justify-between mb-3">
            <View className="flex-row items-center flex-1 mr-2" style={{ gap: 6 }}>
              <Ionicons name="link-outline" size={16} color="#6B7089" />
              <Text className="text-xs text-ink-500 flex-1" numberOfLines={1}>
                {store?.catalogLink.replace(/^https?:\/\//, '')}
              </Text>
            </View>
            <Pressable className="flex-row items-center gap-1" onPress={copyLink}>
              <Ionicons
                name={linkCopied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={linkCopied ? '#1FAA59' : '#FF6B00'}
              />
              <Text className={`text-xs font-bold ${linkCopied ? 'text-success' : 'text-primary-600'}`}>
                {linkCopied ? 'Copiado' : 'Copiar'}
              </Text>
            </Pressable>
          </View>

          <View className="flex-row items-center mt-1 pt-4" style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }}>
            <View className="flex-row items-center flex-1" style={{ gap: 8 }}>
              <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center">
                <Ionicons name="trending-up" size={15} color="#FF6B00" />
              </View>
              <Text className="text-sm font-extrabold text-ink-900">
                {stats ? stats.visitsLast7Days.toLocaleString('pt-BR') : '—'}{' '}
                <Text className="text-xs font-semibold text-ink-500">visitas (7 dias)</Text>
              </Text>
            </View>
            <View className="flex-row items-center flex-1" style={{ gap: 8 }}>
              <View className="w-8 h-8 rounded-full bg-success-bg items-center justify-center">
                <Ionicons name="bag-check-outline" size={15} color="#1FAA59" />
              </View>
              <Text className="text-sm font-extrabold text-ink-900">
                {stats ? stats.ordersCount.toLocaleString('pt-BR') : '—'}{' '}
                <Text className="text-xs font-semibold text-ink-500">pedidos feitos</Text>
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
