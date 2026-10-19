import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Blob } from '../../components/AuthVisuals';

// Exibida enquanto o app consulta GET /me para decidir a tela inicial.
export default function SplashScreen() {
  return (
    <View className="flex-1 bg-ink-50 items-center justify-center" style={{ overflow: 'hidden' }}>
      <StatusBar style="dark" />
      <Blob size={280} opacity={0.22} style={{ top: -80, right: -70 }} />
      <Blob size={220} opacity={0.16} style={{ bottom: -60, left: -80 }} />

      <View className="w-16 h-16 rounded-2xl bg-primary-500 items-center justify-center mb-4">
        <Ionicons name="storefront-outline" size={30} color="#fff" />
      </View>
      <Text className="text-2xl font-extrabold text-ink-900">RevendaJá</Text>
      <ActivityIndicator color="#FF6B00" style={{ marginTop: 24 }} accessibilityLabel="Carregando" />
    </View>
  );
}
