import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthInput, AuthScreen, Banner, CODE_LENGTH, CodeInput, PrimaryButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { forgotPassword, resetPassword } from '../../api/auth';
import { getErrorMessage, isApiError } from '../../api/errors';
import {
  getResetCodeRequestedAt,
  markResetCodeRequested,
  RESET_RESEND_COOLDOWN_SECONDS,
} from '../../auth/passwordReset';
import { formatCountdown, useCooldown } from '../../hooks/useCooldown';
import { useSubmitting } from '../../hooks/useSubmitting';
import { isValidPassword } from '../../utils/validation';

type Props = {
  email: string;
  onBack?: () => void;
  // Chamado depois de redefinir: a navegação volta para o login.
  onDone: () => void;
};

// O código aceita no máximo 5 tentativas; depois disso nem o código certo funciona.
const MAX_CODE_ATTEMPTS = 5;

type FieldErrors = { code?: string; password?: string; confirmPassword?: string };

export default function ResetPasswordScreen({ email, onBack, onDone }: Props) {
  const { returnToLogin } = useAuth();
  const submitting = useSubmitting();
  const resending = useSubmitting();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [highlightResend, setHighlightResend] = useState(false);
  const [requestedAt, setRequestedAt] = useState<number | null>(() => getResetCodeRequestedAt(email));

  const cooldown = useCooldown(requestedAt, RESET_RESEND_COOLDOWN_SECONDS);
  const busy = submitting.loading || resending.loading;
  const attemptsExhausted = failedAttempts >= MAX_CODE_ATTEMPTS;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (code.length !== CODE_LENGTH) next.code = `Informe o código de ${CODE_LENGTH} dígitos enviado para o seu e-mail.`;
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    else if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.';
    return next;
  }

  function handleReset() {
    if (attemptsExhausted) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);
    setInfo(null);
    if (Object.keys(nextErrors).length > 0) return;

    void submitting.run(async () => {
      try {
        await resetPassword({ email, code, password });
      } catch (error) {
        if (isApiError(error) && error.code === 'PASSWORD_RESET_CODE_INVALID') {
          // Única resposta para qualquer falha (errado, expirado, já usado, tentativas esgotadas): pede novo código.
          const attempts = failedAttempts + 1;
          setFailedAttempts(attempts);
          setHighlightResend(true);
          setCode('');
          setFormError(
            attempts >= MAX_CODE_ATTEMPTS
              ? 'Você atingiu o limite de tentativas. Solicite um novo código para continuar.'
              : error.message
          );
        } else {
          setFormError(getErrorMessage(error));
        }
        return;
      }

      // Sucesso: a redefinição derruba a sessão e não há login automático. Volta ao login.
      await returnToLogin({ type: 'success', message: 'Senha redefinida! Entre com a sua nova senha.' });
      onDone();
    });
  }

  function handleResend() {
    if (cooldown > 0 || busy) return;

    void resending.run(async () => {
      setFormError(null);
      setInfo(null);
      try {
        await forgotPassword(email);
        markResetCodeRequested(email);
        setRequestedAt(Date.now());
        // Cada pedido novo invalida o código anterior e zera as tentativas.
        setCode('');
        setErrors({});
        setFailedAttempts(0);
        setHighlightResend(false);
        setInfo('Enviamos um novo código para o seu e-mail. O código anterior deixou de valer.');
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <AuthScreen onBack={onBack}>
      <View className="w-14 h-14 rounded-2xl bg-primary-500 items-center justify-center mb-5">
        <Ionicons name="lock-open-outline" size={26} color="#fff" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Redefinir senha</Text>
      <Text className="text-sm text-ink-400 mb-6">
        Se existir uma conta com esse e-mail, enviamos um código de {CODE_LENGTH} dígitos. Ele vale por 15 minutos —
        olhe também a caixa de spam.
      </Text>

      {formError && <Banner type="error" message={formError} />}
      {info && <Banner type="success" message={info} />}

      <AuthInput label="E-mail" icon="mail-outline" value={email} editable={false} />

      <CodeInput
        label="Código recebido por e-mail"
        value={code}
        onChangeText={(digits) => {
          setCode(digits);
          if (errors.code) setErrors((previous) => ({ ...previous, code: undefined }));
        }}
        error={errors.code}
        autoFocus
        editable={!submitting.loading && !attemptsExhausted}
      />

      <AuthInput
        label="Nova senha"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder="Crie uma nova senha"
        secure
        autoCapitalize="none"
        autoComplete="password-new"
        editable={!submitting.loading}
      />

      <AuthInput
        label="Confirmar nova senha"
        icon="lock-closed-outline"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        error={errors.confirmPassword}
        placeholder="Repita a nova senha"
        secure
        autoCapitalize="none"
        autoComplete="password-new"
        editable={!submitting.loading}
        onSubmitEditing={handleReset}
      />

      <PrimaryButton
        label="Redefinir"
        onPress={handleReset}
        loading={submitting.loading}
        disabled={attemptsExhausted || resending.loading}
        className="mt-2 mb-5"
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
              : highlightResend
                ? 'Solicitar novo código'
                : 'Reenviar código'}
        </Text>
      </Pressable>
    </AuthScreen>
  );
}
