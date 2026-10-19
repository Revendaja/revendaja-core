import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthScreen, PrimaryButton } from '../../components/AuthForm';

type Props = {
  message?: string;
  onRetry: () => void;
  onLogout: () => void;
};

// O app não conseguiu falar com a API ao abrir. Não é sessão expirada: nada foi apagado, dá para tentar de novo.
export default function ConnectionErrorScreen({ message, onRetry, onLogout }: Props) {
  return (
    <AuthScreen topPadding={64}>
      <View className="w-14 h-14 rounded-2xl bg-warning-bg items-center justify-center mb-5">
        <Ionicons name="cloud-offline-outline" size={26} color="#E0952B" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Sem conexão</Text>
      <Text className="text-sm text-ink-400 mb-6">
        {message ?? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'}
      </Text>

      <PrimaryButton label="Tentar novamente" onPress={onRetry} className="mb-5" />

      <Pressable onPress={onLogout} hitSlop={8} className="items-center" accessibilityRole="button">
        <Text className="text-sm font-bold text-ink-400">Sair da conta</Text>
      </Pressable>
    </AuthScreen>
  );
}
