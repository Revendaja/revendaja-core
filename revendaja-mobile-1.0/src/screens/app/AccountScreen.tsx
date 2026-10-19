import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { updateProfile } from '../../api/auth';
import { getErrorMessage, isApiError } from '../../api/errors';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'Account'>;

const NAME_MIN = 2;
const NAME_MAX = 120;
// Mesma regra do cadastro: só dígitos, com DDI+DDD (ex.: 5511982214432).
const WHATSAPP_REGEX = /^\d{10,15}$/;

function formatDate(isoDate: string) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('pt-BR');
}

export default function AccountScreen({ navigation }: Props) {
  const { user, store, applyUser } = useAuth();
  const guard = useStoreAccessGuard();
  const { loading, run } = useSubmitting();

  const [name, setName] = useState(user?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSave() {
    setFormError(null);
    if (!user) return;

    const trimmedName = name.trim();
    const digitsWhatsapp = whatsapp.replace(/\D/g, '');
    const nameOk = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
    const whatsappOk = WHATSAPP_REGEX.test(digitsWhatsapp);
    setNameError(!nameOk ? `Informe seu nome (entre ${NAME_MIN} e ${NAME_MAX} caracteres).` : null);
    setWhatsappError(!whatsappOk ? 'Informe um WhatsApp válido, com DDI e DDD.' : null);
    if (!nameOk || !whatsappOk) return;

    const changes: { name?: string; whatsapp?: string } = {};
    if (trimmedName !== user.name) changes.name = trimmedName;
    if (digitsWhatsapp !== user.whatsapp) changes.whatsapp = digitsWhatsapp;

    if (Object.keys(changes).length === 0) {
      navigation.goBack();
      return;
    }

    void run(async () => {
      try {
        const updated = await guard(() => updateProfile(changes));
        applyUser(updated);
        navigation.goBack();
      } catch (error) {
        if (isApiError(error) && error.code === 'CONFLICT') {
          setWhatsappError('Já existe uma conta com este WhatsApp.');
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between mb-5">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-lg font-extrabold text-ink-900">Meus Dados</Text>
          <View className="w-10 h-10" />
        </View>

        {formError && (
          <View className="bg-danger-bg rounded-xl px-4 py-3 mb-4">
            <Text className="text-sm text-danger">{formError}</Text>
          </View>
        )}

        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-primary-500 items-center justify-center mb-3">
            <Text className="text-white font-bold text-3xl">{name.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          {store && (
            <Text className="text-xs text-ink-400">Loja criada em {formatDate(store.createdAt)}</Text>
          )}
        </View>

        <Text className="text-xs font-bold text-ink-500 mb-1.5">Seu nome</Text>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (nameError) setNameError(null);
          }}
          placeholder="Ex: Juliana Souza"
          placeholderTextColor="#8B8FA3"
          editable={!loading}
          accessibilityLabel="Seu nome"
          className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900"
          style={{ borderWidth: 1.5, borderColor: nameError ? '#E0453F' : 'transparent' }}
        />
        {nameError && <Text className="text-xs text-danger mt-1.5">{nameError}</Text>}

        <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">E-mail</Text>
        <View className="bg-ink-100 rounded-xl px-4 h-12 justify-center opacity-70">
          <Text className="text-sm text-ink-500">{user?.email}</Text>
        </View>
        <Text className="text-xs text-ink-400 mt-1.5">
          O e-mail não pode ser alterado por aqui. Fale com o suporte se precisar trocar.
        </Text>

        <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">WhatsApp</Text>
        <TextInput
          value={whatsapp}
          onChangeText={(text) => {
            setWhatsapp(text);
            if (whatsappError) setWhatsappError(null);
          }}
          placeholder="55DDNÚMERO"
          placeholderTextColor="#8B8FA3"
          keyboardType="phone-pad"
          editable={!loading}
          accessibilityLabel="WhatsApp"
          className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900 mb-6"
          style={{ borderWidth: 1.5, borderColor: whatsappError ? '#E0453F' : 'transparent' }}
        />
        {whatsappError && <Text className="text-xs text-danger mt-1.5 mb-6">{whatsappError}</Text>}

        <Pressable
          className="bg-primary-500 rounded-2xl items-center justify-center h-14"
          onPress={handleSave}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Salvar alterações"
        >
          <Text className="text-white font-extrabold text-base">{loading ? 'Salvando...' : 'Salvar Alterações'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
