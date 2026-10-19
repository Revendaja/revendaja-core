import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { AuthInput, AuthScreen, Banner, PrimaryButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import * as authApi from '../../api/auth';
import { getErrorMessage } from '../../api/errors';
import { useSubmitting } from '../../hooks/useSubmitting';
import { isValidWhatsapp, maskWhatsapp, toApiWhatsapp } from '../../utils/validation';

// Só aparece para quem entrou pela primeira vez com o Google (ver AuthContext/needsWhatsapp em
// RootNavigator): o cadastro por e-mail/senha já pede o WhatsApp antes, então essa tela não entra
// no caminho dele.
export default function CompleteProfileScreen() {
  const { applyUser, logout } = useAuth();
  const { loading, run } = useSubmitting();
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit() {
    if (!isValidWhatsapp(whatsapp)) {
      setError('Informe um WhatsApp válido com DDD.');
      return;
    }
    setError(null);
    setFormError(null);

    void run(async () => {
      try {
        const user = await authApi.updateProfile({ whatsapp: toApiWhatsapp(whatsapp) });
        applyUser(user);
      } catch (err) {
        setFormError(getErrorMessage(err));
      }
    });
  }

  return (
    <AuthScreen onBack={() => void logout()}>
      <View className="w-14 h-14 rounded-2xl bg-primary-500 items-center justify-center mb-5">
        <Ionicons name="logo-whatsapp" size={26} color="#fff" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Falta só mais um passo</Text>
      <Text className="text-sm text-ink-400 mb-6">
        É assim que avisamos sobre pedidos e novidades da sua loja
      </Text>

      {formError && <Banner type="error" message={formError} />}

      <AuthInput
        label="WhatsApp"
        icon="logo-whatsapp"
        prefix="+55"
        value={whatsapp}
        onChangeText={(text) => setWhatsapp((previous) => maskWhatsapp(text, previous))}
        error={error}
        placeholder="(11) 98221-4432"
        keyboardType="phone-pad"
        autoComplete="tel"
        autoFocus
        editable={!loading}
        onSubmitEditing={handleSubmit}
      />

      <PrimaryButton label="Continuar" onPress={handleSubmit} loading={loading} className="mt-2 mb-6" />
    </AuthScreen>
  );
}
