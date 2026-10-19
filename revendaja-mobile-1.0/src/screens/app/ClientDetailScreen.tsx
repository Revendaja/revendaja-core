import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { clients } from '../../data/clients';
import { sales } from '../../data/sales';
import type { MoreStackParamList } from '../../navigation/types';
import type { SaleStatus } from '../../types';

type Props = NativeStackScreenProps<MoreStackParamList, 'ClientDetail'>;

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_STYLE: Record<SaleStatus, { bg: string; text: string }> = {
  Pago: { bg: 'bg-success-bg', text: 'text-success' },
  Pendente: { bg: 'bg-warning-bg', text: 'text-warning' },
};

export default function ClientDetailScreen({ route, navigation }: Props) {
  const client = clients.find((c) => c.id === route.params.clientId);
  const clientSales = sales.filter((s) => s.clientId === route.params.clientId);

  if (!client) {
    return (
      <SafeAreaView className="flex-1 bg-ink-50">
        <Text className="text-center text-ink-500 mt-10">Cliente não encontrado.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Pressable
          className="w-10 h-10 rounded-full bg-white items-center justify-center mb-4"
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#1A1B25" />
        </Pressable>

        <View className="items-center mb-5">
          <View
            className="w-[72px] h-[72px] rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: client.avatarColor }}
          >
            <Text className="text-white font-bold text-3xl">{client.name.charAt(0)}</Text>
          </View>
          <Text className="text-xl font-extrabold text-ink-900">{client.name}</Text>
          <Text className="text-sm text-ink-500 mt-0.5">{client.city}</Text>
        </View>

        <View className="flex-row gap-2.5 mb-4">
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-xl py-3"
            onPress={() => Linking.openURL(`tel:${client.phone.replace(/\D/g, '')}`)}
          >
            <Ionicons name="call-outline" size={18} color="#FF6B00" />
            <Text className="text-xs font-bold text-primary-600">{client.phone}</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-success rounded-xl py-3"
            onPress={() => Linking.openURL(`https://wa.me/55${client.phone.replace(/\D/g, '')}`)}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text className="text-xs font-bold text-white">WhatsApp</Text>
          </Pressable>
        </View>

        <View className="bg-primary-500 rounded-2xl p-5 mb-5">
          <Text className="text-xs text-white/85">Total em compras</Text>
          <Text className="text-3xl font-extrabold text-white mt-1">{formatCurrency(client.totalPurchases)}</Text>
        </View>

        <Text className="text-lg font-extrabold text-ink-900 mb-3">Histórico de vendas</Text>

        {clientSales.length === 0 && <Text className="text-ink-500">Nenhuma venda registrada.</Text>}

        {clientSales.map((sale) => {
          const total = sale.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
          const statusStyle = STATUS_STYLE[sale.status];

          return (
            <View key={sale.id} className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink-900">{sale.date}</Text>
                <Text className="text-xs text-ink-500 mt-0.5">{sale.items.length} item(ns)</Text>
              </View>
              <View className="items-end gap-1">
                <Text className="text-sm font-bold text-ink-900">{formatCurrency(total)}</Text>
                <View className={`rounded-lg px-2 py-0.5 ${statusStyle.bg}`}>
                  <Text className={`text-[11px] font-bold ${statusStyle.text}`}>{sale.status}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
