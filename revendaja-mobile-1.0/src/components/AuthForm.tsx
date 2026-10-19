import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Blob } from './AuthVisuals';

type IconName = keyof typeof Ionicons.glyphMap;

const PRIMARY = '#FF6B00';
const MUTED = '#8B8FA3';
const DANGER = '#E0453F';

// Casca das telas de autenticação: fundo com blobs, teclado, scroll e botão de voltar opcional.
export function AuthScreen({
  children,
  onBack,
  topPadding = 16,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  topPadding?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-ink-50" style={{ overflow: 'hidden' }}>
      <StatusBar style="dark" />
      <Blob size={280} opacity={0.22} style={{ top: -80, right: -70 }} />
      <Blob size={220} opacity={0.16} style={{ bottom: -60, left: -80 }} />

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: insets.top + topPadding,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 24,
          }}
        >
          {onBack && (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              className="w-10 h-10 rounded-full bg-white items-center justify-center mb-6"
            >
              <Ionicons name="arrow-back" size={20} color="#1A1B25" />
            </Pressable>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Indicador de progresso de um formulário em etapas (ex.: Criar conta). `step` é 1-indexado: as
// barras até `step` (inclusive) ficam preenchidas, o resto fica neutro.
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View className="flex-row mb-5" style={{ gap: 6 }}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className="flex-1 h-1.5 rounded-full"
          style={{ backgroundColor: index < step ? PRIMARY : '#E7E8F0' }}
        />
      ))}
    </View>
  );
}

type AuthInputProps = Omit<TextInputProps, 'style' | 'className' | 'secureTextEntry'> & {
  label: string;
  icon: IconName;
  error?: string | null;
  // Texto fixo antes do campo (ex.: "+55").
  prefix?: string;
  // Campo de senha com botão de mostrar/ocultar.
  secure?: boolean;
};

export function AuthInput({ label, icon, error, prefix, secure = false, editable = true, ...inputProps }: AuthInputProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasError = !!error;
  const iconColor = hasError ? DANGER : focused ? PRIMARY : MUTED;

  return (
    <View className="mb-4">
      <Text className="text-xs font-bold text-ink-500 mb-1.5">{label}</Text>
      <View
        className="flex-row items-center bg-white rounded-2xl px-4 h-14"
        style={{
          borderWidth: 1.5,
          borderColor: hasError ? DANGER : focused ? PRIMARY : 'transparent',
          opacity: editable ? 1 : 0.6,
        }}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
        {!!prefix && <Text className="text-sm font-bold text-ink-500 ml-3">{prefix}</Text>}
        <TextInput
          {...inputProps}
          editable={editable}
          accessibilityLabel={label}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          placeholderTextColor={MUTED}
          className={`flex-1 text-sm text-ink-900 ${prefix ? 'ml-2' : 'ml-3'}`}
        />
        {secure && (
          <Pressable
            onPress={() => setRevealed((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            hitSlop={8}
          >
            <Ionicons name={revealed ? 'eye-off' : 'eye'} size={20} color={MUTED} />
          </Pressable>
        )}
      </View>
      {hasError && (
        <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

export const CODE_LENGTH = 6;

// Campo único de código de 6 dígitos: teclado numérico, aceita colar e sugestão de código do e-mail (iOS/Android).
export function CodeInput({
  label,
  value,
  onChangeText,
  error,
  autoFocus = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (digits: string) => void;
  error?: string | null;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  const hasError = !!error;

  return (
    <View className="mb-4">
      <Text className="text-xs font-bold text-ink-500 mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        placeholder="000000"
        placeholderTextColor="#C7C9D9"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        editable={editable}
        accessibilityLabel={label}
        className="bg-white rounded-2xl px-4 h-16 text-ink-900"
        style={{
          fontSize: 24,
          fontWeight: '800',
          letterSpacing: 10,
          textAlign: 'center',
          borderWidth: 1.5,
          borderColor: hasError ? DANGER : 'transparent',
          opacity: editable ? 1 : 0.6,
        }}
      />
      {hasError && (
        <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  className,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const inactive = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      className={className}
    >
      {({ pressed }) => (
        <View
          className="rounded-2xl items-center justify-center h-14"
          style={{ backgroundColor: PRIMARY, opacity: inactive ? 0.6 : pressed ? 0.9 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-extrabold text-base">{label}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

type BannerType = 'error' | 'success' | 'info';

const BANNER_STYLES: Record<BannerType, { icon: IconName; color: string; bg: string }> = {
  error: { icon: 'alert-circle', color: DANGER, bg: '#FCEAE9' },
  success: { icon: 'checkmark-circle', color: '#1FAA59', bg: '#E4F7EB' },
  info: { icon: 'information-circle', color: '#B84C00', bg: '#FFF3E9' },
};

// Mensagem de nível de formulário (erro da API, aviso de sessão encerrada, confirmações).
export function Banner({
  type,
  message,
  className = 'mb-4',
}: {
  type: BannerType;
  message: string;
  className?: string;
}) {
  const { icon, color, bg } = BANNER_STYLES[type];

  return (
    <View
      className={`flex-row items-start rounded-2xl px-4 py-3 ${className}`}
      style={{ backgroundColor: bg }}
      accessibilityRole={type === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-sm text-ink-700 ml-2.5">{message}</Text>
    </View>
  );
}
