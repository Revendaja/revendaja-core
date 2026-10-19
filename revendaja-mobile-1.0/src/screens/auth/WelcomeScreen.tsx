import React from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

type Props = {
  onNavigateToLogin?: () => void;
  onNavigateToRegister?: () => void;
};

export default function WelcomeScreen({ onNavigateToLogin, onNavigateToRegister }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ backgroundColor: '#EC591D' }}>
      <StatusBar style="light" />
      <Image
        source={require('../../../assets/auth/bg-login.png')}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, { top: -2, bottom: -2, left: -2, right: -2 }]}
      />

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1 justify-end px-6" style={{ paddingBottom: insets.bottom + 24 }}>
          <Text className="text-[28px] leading-9 font-extrabold text-white text-center">
            Vamos começar
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className="text-base text-white/85 text-center mt-2 mb-8 px-4"
          >
            Entre na sua conta ou cadastre sua revenda
          </Text>

          <Pressable onPress={onNavigateToLogin} className="mb-3">
            {({ pressed }) => (
              <View
                className="rounded-full items-center justify-center h-14"
                style={{ backgroundColor: '#fff', opacity: pressed ? 0.9 : 1 }}
              >
                <Text className="text-primary-600 font-extrabold text-base">Fazer Login</Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={onNavigateToRegister}>
            {({ pressed }) => (
              <View
                className="rounded-full items-center justify-center h-14"
                style={{ backgroundColor: 'rgba(255,255,255,0.16)', opacity: pressed ? 0.85 : 1 }}
              >
                <Text className="text-white font-extrabold text-base">Criar Conta</Text>
              </View>
            )}
          </Pressable>

          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            className="text-xs text-white/75 text-center mt-6 leading-5"
          >
            Ao continuar, você aceita os{'\n'}
            <Text className="font-bold text-white">Termos de Uso</Text> e a{' '}
            <Text className="font-bold text-white">Política de Privacidade</Text> da RevendaJá
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
