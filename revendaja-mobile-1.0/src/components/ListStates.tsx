import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

// Falha ao carregar a lista (sem conexão, erro do servidor...): sempre com "Tentar novamente".
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="items-center px-8 py-14">
      <View className="w-14 h-14 rounded-2xl bg-warning-bg items-center justify-center mb-4">
        <Ionicons name="cloud-offline-outline" size={26} color="#E0952B" />
      </View>
      <Text className="text-base font-extrabold text-ink-900 mb-1">Não foi possível carregar</Text>
      <Text className="text-sm text-ink-400 text-center mb-5">{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="bg-primary-500 rounded-full px-6 h-11 items-center justify-center"
      >
        <Text className="text-white text-sm font-bold">Tentar novamente</Text>
      </Pressable>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="items-center px-8 py-14">
      <View className="w-14 h-14 rounded-2xl bg-primary-50 items-center justify-center mb-4">
        <Ionicons name={icon} size={26} color="#FF6B00" />
      </View>
      <Text className="text-base font-extrabold text-ink-900 text-center">{title}</Text>
      {!!subtitle && <Text className="text-sm text-ink-400 text-center mt-1">{subtitle}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          className="bg-primary-500 rounded-full px-6 h-11 items-center justify-center mt-5"
        >
          <Text className="text-white text-sm font-bold">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Rodapé da rolagem infinita: spinner enquanto carrega a próxima página, ou o erro com "Tentar novamente".
export function ListFooter({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <View className="py-5 items-center">
        <ActivityIndicator color="#FF6B00" accessibilityLabel="Carregando mais" />
      </View>
    );
  }
  if (error) {
    return (
      <View className="py-4 items-center">
        <Text className="text-xs text-ink-400 text-center mb-2">{error}</Text>
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <Text className="text-sm font-bold text-primary-500">Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}
