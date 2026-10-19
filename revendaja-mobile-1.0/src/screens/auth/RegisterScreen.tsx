import React, { useState } from 'react';
import { ActivityIndicator, Alert, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleLogo } from '../../components/AuthVisuals';
import { AuthInput, AuthScreen, Banner, PrimaryButton, StepProgress } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage, isApiError } from '../../api/errors';
import { useSubmitting } from '../../hooks/useSubmitting';
import {
  isValidEmail,
  isValidName,
  isValidPassword,
  isValidWhatsapp,
  maskWhatsapp,
  normalizeEmail,
  toApiWhatsapp,
} from '../../utils/validation';

type Props = {
  onNavigateToLogin?: () => void;
  onGoogleLogin?: () => Promise<void>;
  onBack?: () => void;
};

type Field = 'name' | 'whatsapp' | 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, string>>;

const TOTAL_STEPS = 3;

const STEP_COPY: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Criar conta', subtitle: 'Como você quer começar?' },
  2: { title: 'Seus contatos', subtitle: 'É assim que avisamos sobre pedidos e novidades' },
  3: { title: 'Crie uma senha', subtitle: 'Só mais um passo para começar a vender' },
};

export default function RegisterScreen({ onNavigateToLogin, onGoogleLogin, onBack }: Props) {
  const { register } = useAuth();
  const { loading, run } = useSubmitting();
  const google = useSubmitting();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validateStep1(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidName(name)) next.name = 'Informe seu nome (mínimo 2 caracteres).';
    return next;
  }

  function validateStep2(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidWhatsapp(whatsapp)) next.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (!isValidEmail(email)) next.email = 'Informe um e-mail válido.';
    return next;
  }

  function validateStep3(): FieldErrors {
    const next: FieldErrors = {};
    if (!isValidPassword(password)) next.password = 'A senha deve ter entre 6 e 72 caracteres.';
    else if (password !== confirmPassword) next.confirmPassword = 'As senhas não coincidem.';
    return next;
  }

  function goToStep(next: number) {
    setErrors({});
    setFormError(null);
    setStep(next);
  }

  function handleNext() {
    const nextErrors = step === 1 ? validateStep1() : validateStep2();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;
    goToStep(step + 1);
  }

  function handleBackStep() {
    if (step === 1) {
      onBack?.();
      return;
    }
    goToStep(step - 1);
  }

  function handleSocialPlaceholder(provider: 'Facebook') {
    Alert.alert('Em breve', `Continuar com ${provider} estará disponível em breve.`);
  }

  function handleGoogleLogin() {
    if (!onGoogleLogin) return;
    void google.run(async () => {
      setFormError(null);
      try {
        await onGoogleLogin();
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  function handleRegister() {
    const nextErrors = validateStep3();
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    void run(async () => {
      try {
        await register({
          name: name.trim(),
          email: normalizeEmail(email),
          whatsapp: toApiWhatsapp(whatsapp),
          password,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        if (isApiError(error) && error.status === 409) {
          // "Já existe uma conta com este e-mail." / "...com este WhatsApp.": o campo em questão
          // fica no passo 2, não no atual (3) — volta pra lá pra mostrar o erro onde ele faz sentido.
          const field: Field | null = /whatsapp/i.test(message) ? 'whatsapp' : /e-?mail/i.test(message) ? 'email' : null;
          if (field) {
            setErrors({ [field]: message });
            setStep(2);
            return;
          }
        }
        setFormError(message);
      }
    });
  }

  const copy = STEP_COPY[step];

  return (
    <AuthScreen onBack={handleBackStep}>
      <StepProgress step={step} total={TOTAL_STEPS} />
      <Text className="text-xs font-bold text-primary-500 mb-1">
        Passo {step} de {TOTAL_STEPS}
      </Text>
      <Text className="text-2xl font-extrabold text-ink-900 mb-1">{copy.title}</Text>
      <Text className="text-sm text-ink-400 mb-6">{copy.subtitle}</Text>

      {formError && <Banner type="error" message={formError} />}

      {step === 1 && (
        <>
          <AuthInput
            label="Nome completo"
            icon="person-outline"
            value={name}
            onChangeText={setName}
            error={errors.name}
            placeholder="Seu nome"
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
            maxLength={120}
            onSubmitEditing={handleNext}
          />

          <PrimaryButton label="Continuar" onPress={handleNext} className="mt-2 mb-6" />

          <View className="flex-row items-center mb-5">
            <View className="flex-1 h-px bg-ink-100" />
            <Text className="text-xs text-ink-400 mx-3">ou continue com</Text>
            <View className="flex-1 h-px bg-ink-100" />
          </View>

          <Pressable
            onPress={() => handleSocialPlaceholder('Facebook')}
            disabled={google.loading}
            className="mb-3"
            accessibilityRole="button"
            accessibilityLabel="Continuar com Facebook"
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-center h-14 rounded-2xl bg-white"
                style={{ opacity: google.loading ? 0.6 : pressed ? 0.85 : 1 }}
              >
                <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                <Text className="text-ink-900 font-bold text-base ml-2">Continuar com Facebook</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={handleGoogleLogin}
            disabled={google.loading}
            className="mb-6"
            accessibilityRole="button"
            accessibilityLabel="Continuar com Google"
            accessibilityState={{ busy: google.loading, disabled: google.loading }}
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-center h-14 rounded-2xl bg-white"
                style={{ opacity: pressed ? 0.85 : 1 }}
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
            <Text className="text-sm text-ink-400">Já tem conta? </Text>
            <Pressable onPress={onNavigateToLogin} hitSlop={8}>
              <Text className="text-sm font-extrabold text-primary-500">Entrar</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <AuthInput
            label="WhatsApp"
            icon="logo-whatsapp"
            prefix="+55"
            value={whatsapp}
            onChangeText={(text) => setWhatsapp((previous) => maskWhatsapp(text, previous))}
            error={errors.whatsapp}
            placeholder="(11) 98221-4432"
            keyboardType="phone-pad"
            autoComplete="tel"
            autoFocus
          />

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
            onSubmitEditing={handleNext}
          />

          <PrimaryButton label="Continuar" onPress={handleNext} className="mt-2 mb-6" />
        </>
      )}

      {step === 3 && (
        <>
          <AuthInput
            label="Senha"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            placeholder="Crie uma senha"
            secure
            autoCapitalize="none"
            autoComplete="password-new"
            autoFocus
            editable={!loading}
          />

          <AuthInput
            label="Confirmar senha"
            icon="lock-closed-outline"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={errors.confirmPassword}
            placeholder="Repita a senha"
            secure
            autoCapitalize="none"
            autoComplete="password-new"
            editable={!loading}
            onSubmitEditing={handleRegister}
          />

          <PrimaryButton label="Criar Conta" onPress={handleRegister} loading={loading} className="mt-2 mb-6" />
        </>
      )}
    </AuthScreen>
  );
}
