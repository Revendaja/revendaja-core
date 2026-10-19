import React, { useState } from 'react';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleLogo } from '../../components/AuthVisuals';
import { AuthInput, AuthScreen, Banner, PrimaryButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage } from '../../api/errors';
import { useSubmitting } from '../../hooks/useSubmitting';
import { isValidEmail, isValidPassword, normalizeEmail } from '../../utils/validation';

type Props = {
  onNavigateToRegister?: () => void;
  onNavigateToForgotPassword?: () => void;
  onGoogleLogin?: () => Promise<void>;
  onFacebookLogin?: () => void;
  onBack?: () => void;
};

type FieldErrors = { email?: string; password?: string };

export default function LoginScreen({
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onGoogleLogin,
  onFacebookLogin,
  onBack,
}: Props) {
  const { login, notice, clearNotice } = useAuth();
  const { loading, run } = useSubmitting();
  const google = useSubmitting();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const busy = loading || google.loading;

  function handleGoogleLogin() {
    if (!onGoogleLogin) return;
    void google.run(async () => {
      clearNotice();
      setFormError(null);
      try {
        await onGoogleLogin();
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido.';
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    return next;
  }

  function handleLogin() {
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    void run(async () => {
      clearNotice();
      try {
        await login({ email: normalizeEmail(email), password });
      } catch (error) {
        // 401 aqui é "E-mail ou senha inválidos.": erro de formulário, não sessão expirada.
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthScreen onBack={onBack}>
      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Entrar com e-mail</Text>
      <Text className="text-sm text-ink-400 mb-6">Use seus dados para acessar sua conta</Text>

      {notice && <Banner type={notice.type} message={notice.message} />}
      {formError && <Banner type="error" message={formError} />}

      <AuthInput
        label="E-mail"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        autoFocus
        editable={!busy}
      />

      <AuthInput
        label="Senha"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder="Sua senha"
        secure
        autoCapitalize="none"
        autoComplete="password"
        editable={!busy}
        onSubmitEditing={handleLogin}
      />

      <Pressable className="self-end mb-6 -mt-2" onPress={onNavigateToForgotPassword} hitSlop={8}>
        <Text className="text-xs font-bold text-primary-500">Esqueceu sua senha?</Text>
      </Pressable>

      <PrimaryButton label="Entrar" onPress={handleLogin} loading={loading} disabled={busy} className="mb-6" />

      <View className="flex-row items-center mb-5">
        <View className="flex-1 h-px bg-ink-100" />
        <Text className="text-xs text-ink-400 mx-3">ou continue com</Text>
        <View className="flex-1 h-px bg-ink-100" />
      </View>

      <Pressable
        onPress={onFacebookLogin}
        disabled={busy}
        className="mb-3"
        accessibilityRole="button"
        accessibilityLabel="Continuar com Facebook"
      >
        {({ pressed }) => (
          <View
            className="flex-row items-center justify-center h-14 rounded-2xl bg-white"
            style={{ opacity: busy ? 0.6 : pressed ? 0.85 : 1 }}
          >
            <Ionicons name="logo-facebook" size={20} color="#1877F2" />
            <Text className="text-ink-900 font-bold text-base ml-2">Continuar com Facebook</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={handleGoogleLogin}
        disabled={busy}
        className="mb-6"
        accessibilityRole="button"
        accessibilityLabel="Continuar com Google"
        accessibilityState={{ busy: google.loading, disabled: busy }}
      >
        {({ pressed }) => (
          <View
            className="flex-row items-center justify-center h-14 rounded-2xl bg-white"
            style={{ opacity: busy && !google.loading ? 0.6 : pressed ? 0.85 : 1 }}
          >
            {google.loading ? (
              <ActivityIndicator color="#3C4043" />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={{ color: '#3C4043' }} className="font-bold text-base ml-3">
                  Continuar com Google
                </Text>
              </>
            )}
          </View>
        )}
      </Pressable>

      <View className="flex-row justify-center">
        <Text className="text-sm text-ink-400">Ainda não tem conta? </Text>
        <Pressable onPress={onNavigateToRegister} hitSlop={8}>
          <Text className="text-sm font-extrabold text-primary-500">Criar conta</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
