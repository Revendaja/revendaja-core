import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { signInWithGoogle } from '../../auth/googleAuth';
import { deleteAccount, getMe } from '../../api/auth';
import { getErrorMessage } from '../../api/errors';
import { useSubmitting } from '../../hooks/useSubmitting';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'DeleteAccount'>;

const WILL_BE_DELETED = [
  'Seus dados de acesso (nome, e-mail, WhatsApp e senha)',
  'Sua loja e a vitrine online',
  'Todos os produtos, categorias e imagens',
  'Todas as vendas e os dados dos clientes que você registrou',
  'As conversas com o assistente',
];

export default function DeleteAccountScreen({ navigation }: Props) {
  const { returnToLogin } = useAuth();
  const { loading, run } = useSubmitting();

  // null = ainda descobrindo se a conta tem senha (conta criada só pelo Google não tem).
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (active) setHasPassword(me.hasPassword);
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function performDelete(input: { password?: string; googleIdToken?: string }) {
    try {
      await deleteAccount(input);
    } catch (error) {
      setFormError(getErrorMessage(error));
      return;
    }
    // A conta já foi apagada no servidor: só limpa a sessão local e volta ao login.
    await returnToLogin({ type: 'success', message: 'Sua conta e seus dados foram excluídos.' });
  }

  function confirmAndDelete(buildInput: () => Promise<{ password?: string; googleIdToken?: string } | null>) {
    setFormError(null);
    Alert.alert(
      'Excluir conta definitivamente?',
      'Isso apaga sua loja, produtos, vendas e dados. Não tem como desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () =>
            void run(async () => {
              try {
                const input = await buildInput();
                if (input) await performDelete(input);
              } catch (error) {
                setFormError(error instanceof Error ? error.message : getErrorMessage(error));
              }
            }),
        },
      ]
    );
  }

  function handleDeleteWithPassword() {
    if (!password) {
      setFormError('Digite sua senha para confirmar.');
      return;
    }
    confirmAndDelete(async () => ({ password }));
  }

  function handleDeleteWithGoogle() {
    // O seletor do Google abre só depois do "Excluir": quem desistir no alerta não é incomodada.
    confirmAndDelete(async () => {
      const googleIdToken = await signInWithGoogle();
      return googleIdToken === null ? null : { googleIdToken };
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between mb-5">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            onPress={() => navigation.goBack()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-lg font-extrabold text-ink-900">Excluir conta</Text>
          <View className="w-10 h-10" />
        </View>

        <View className="bg-danger-bg rounded-2xl px-4 py-4 mb-5">
          <Text className="text-sm font-bold text-danger mb-2">Esta ação é definitiva</Text>
          <Text className="text-sm text-ink-700 leading-5 mb-2">Ao excluir sua conta, apagamos:</Text>
          {WILL_BE_DELETED.map((item) => (
            <Text key={item} className="text-sm text-ink-700 leading-5">
              • {item}
            </Text>
          ))}
          <Text className="text-sm text-ink-700 leading-5 mt-2">
            Se você tem uma assinatura ativa, ela será cancelada. Registros de cobrança podem ser mantidos
            pelo prazo exigido por lei.
          </Text>
        </View>

        {formError && (
          <View className="bg-danger-bg rounded-xl px-4 py-3 mb-4">
            <Text className="text-sm text-danger">{formError}</Text>
          </View>
        )}

        {loadError ? (
          <View className="bg-danger-bg rounded-xl px-4 py-3">
            <Text className="text-sm text-danger">{loadError}</Text>
          </View>
        ) : hasPassword === null ? (
          <ActivityIndicator color="#E0453F" />
        ) : hasPassword ? (
          <>
            <Text className="text-xs font-bold text-ink-500 mb-1.5">Digite sua senha para confirmar</Text>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (formError) setFormError(null);
              }}
              placeholder="Sua senha"
              placeholderTextColor="#8B8FA3"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              accessibilityLabel="Senha"
              className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900 mb-5"
            />
            <Pressable
              className="bg-danger rounded-2xl items-center justify-center h-14"
              onPress={handleDeleteWithPassword}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Excluir minha conta"
            >
              <Text className="text-white font-extrabold text-base">
                {loading ? 'Excluindo...' : 'Excluir minha conta'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="text-sm text-ink-500 mb-4">
              Sua conta usa o login do Google. Para confirmar, você vai escolher a conta Google de novo.
            </Text>
            <Pressable
              className="bg-danger rounded-2xl items-center justify-center h-14"
              onPress={handleDeleteWithGoogle}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Confirmar com Google e excluir"
            >
              <Text className="text-white font-extrabold text-base">
                {loading ? 'Excluindo...' : 'Confirmar com Google e excluir'}
              </Text>
            </Pressable>
          </>
        )}

        <Pressable
          className="items-center justify-center h-12 mt-3"
          onPress={() => navigation.goBack()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
        >
          <Text className="text-ink-500 font-bold text-sm">Cancelar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
