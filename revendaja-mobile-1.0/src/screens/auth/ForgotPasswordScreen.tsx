import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthInput, AuthScreen, Banner, PrimaryButton } from '../../components/AuthForm';
import { forgotPassword } from '../../api/auth';
import { getErrorMessage } from '../../api/errors';
import { isInResetCooldown, markResetCodeRequested } from '../../auth/passwordReset';
import { useSubmitting } from '../../hooks/useSubmitting';
import { isValidEmail, normalizeEmail } from '../../utils/validation';

type Props = {
  onCodeSent: (email: string) => void;
  onBack?: () => void;
};

export default function ForgotPasswordScreen({ onCodeSent, onBack }: Props) {
  const { loading, run } = useSubmitting();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSend() {
    setFormError(null);
    if (!isValidEmail(email)) {
      setEmailError('Informe um e-mail válido.');
      return;
    }
    setEmailError(null);
    const normalized = normalizeEmail(email);

    // Já pedimos um código para este e-mail há menos de 30 s: a API ignoraria o pedido em silêncio.
    // O código anterior continua valendo, então só seguimos para a tela de digitar o código.
    if (isInResetCooldown(normalized)) {
      onCodeSent(normalized);
      return;
    }

    void run(async () => {
      try {
        // Responde 200 sempre, exista ou não conta com esse e-mail.
        await forgotPassword(normalized);
        markResetCodeRequested(normalized);
        onCodeSent(normalized);
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthScreen onBack={onBack}>
      <View className="w-14 h-14 rounded-2xl bg-primary-500 items-center justify-center mb-5">
        <Ionicons name="key-outline" size={26} color="#fff" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Esqueceu sua senha?</Text>
      <Text className="text-sm text-ink-400 mb-6">
        Informe seu e-mail e enviaremos um código de 6 dígitos para você criar uma nova senha
      </Text>

      {formError && <Banner type="error" message={formError} />}

      <AuthInput
        label="E-mail"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        placeholder="voce@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        autoFocus
        editable={!loading}
        onSubmitEditing={handleSend}
      />

      <PrimaryButton label="Enviar código" onPress={handleSend} loading={loading} className="mt-2" />
    </AuthScreen>
  );
}
