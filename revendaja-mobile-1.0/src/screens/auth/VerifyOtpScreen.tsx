import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthScreen, Banner, CODE_LENGTH, CodeInput, PrimaryButton } from '../../components/AuthForm';
import { OTP_RESEND_COOLDOWN_SECONDS, useAuth } from '../../auth/AuthContext';
import { getErrorMessage, isApiError } from '../../api/errors';
import { formatCountdown, useCooldown } from '../../hooks/useCooldown';
import { useSubmitting } from '../../hooks/useSubmitting';

// Erros 400 que exigem um novo código: o usuário precisa tocar em "Reenviar código".
const NEEDS_NEW_CODE = ['OTP_NOT_FOUND', 'OTP_EXPIRED', 'OTP_MAX_ATTEMPTS_REACHED'];

export default function VerifyOtpScreen() {
  const { user, otpSentAt, verifyOtp, resendOtp, setOtpCooldownRemaining, logout } = useAuth();
  const verifying = useSubmitting();
  const resending = useSubmitting();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [highlightResend, setHighlightResend] = useState(false);

  const cooldown = useCooldown(otpSentAt, OTP_RESEND_COOLDOWN_SECONDS);
  const busy = verifying.loading || resending.loading;

  function submit(value: string) {
    if (value.length !== CODE_LENGTH) {
      setCodeError(`Informe o código de ${CODE_LENGTH} dígitos que enviamos para o seu e-mail.`);
      return;
    }

    void verifying.run(async () => {
      setCodeError(null);
      setFormError(null);
      setInfo(null);
      try {
        // Sucesso: o AuthContext marca a conta como verificada e o app segue para criar a loja.
        await verifyOtp(value);
      } catch (error) {
        if (isApiError(error) && error.status === 401) {
          // "Código inválido." (máx. 5 tentativas erradas por código).
          setCodeError(error.message);
          setCode('');
        } else if (isApiError(error) && NEEDS_NEW_CODE.includes(error.code)) {
          setFormError(error.message);
          setHighlightResend(true);
          setCode('');
        } else {
          setFormError(getErrorMessage(error));
        }
      }
    });
  }

  function handleChangeCode(digits: string) {
    setCode(digits);
    if (codeError) setCodeError(null);
    // Envia sozinho ao completar os 6 dígitos (digitando, colando ou pela sugestão do teclado).
    if (digits.length === CODE_LENGTH) submit(digits);
  }

  function handleResend() {
    if (cooldown > 0 || busy) return;

    void resending.run(async () => {
      setFormError(null);
      setInfo(null);
      try {
        await resendOtp();
        setCode('');
        setCodeError(null);
        setHighlightResend(false);
        setInfo('Enviamos um novo código para o seu e-mail. O código anterior deixou de valer.');
      } catch (error) {
        if (isApiError(error) && error.status === 429) {
          // "Aguarde {n}s antes de solicitar um novo código." — alinha o contador com o do servidor.
          const seconds = /(\d+)\s*s\b/.exec(error.message)?.[1];
          if (seconds) setOtpCooldownRemaining(Number(seconds));
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthScreen onBack={() => void logout()}>
      <View className="w-14 h-14 rounded-2xl bg-primary-500 items-center justify-center mb-5">
        <Ionicons name="mail-outline" size={26} color="#fff" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Confirme seu e-mail</Text>
      <Text className="text-sm text-ink-400 mb-1">
        Enviamos um código de {CODE_LENGTH} dígitos para o seu e-mail{' '}
        <Text className="font-bold text-ink-700">{user?.email}</Text>
      </Text>
      <Text className="text-xs text-ink-400 mb-6">Não chegou? Olhe também a caixa de spam.</Text>

      {formError && <Banner type="error" message={formError} />}
      {info && <Banner type="success" message={info} />}

      <CodeInput
        label="Código de verificação"
        value={code}
        onChangeText={handleChangeCode}
        error={codeError}
        autoFocus
        editable={!verifying.loading}
      />

      <PrimaryButton
        label="Confirmar"
        onPress={() => submit(code)}
        loading={verifying.loading}
        disabled={resending.loading}
        className="mb-5"
      />

      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ disabled: cooldown > 0 || busy }}
        className="items-center justify-center"
        style={
          highlightResend
            ? { height: 48, borderRadius: 16, borderWidth: 1.5, borderColor: '#FF6B00', backgroundColor: '#FFF3E9' }
            : undefined
        }
      >
        <Text className={`text-sm font-bold ${cooldown > 0 ? 'text-ink-400' : 'text-primary-500'}`}>
          {resending.loading
            ? 'Enviando...'
            : cooldown > 0
              ? `Reenviar código em ${formatCountdown(cooldown)}`
              : 'Reenviar código'}
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
