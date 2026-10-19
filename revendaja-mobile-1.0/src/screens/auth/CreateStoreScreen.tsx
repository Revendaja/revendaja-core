import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { AuthInput, AuthScreen, Banner, PrimaryButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { createStore } from '../../api/stores';
import { getErrorMessage, isApiError } from '../../api/errors';
import type { StoreInfo } from '../../api/types';
import { useSubmitting } from '../../hooks/useSubmitting';
import { isValidName } from '../../utils/validation';

export default function CreateStoreScreen() {
  const { applyStore, markUnverified, refreshMe, logout } = useAuth();
  const { loading, run } = useSubmitting();
  const [storeName, setStoreName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Loja recém-criada: mostramos o link antes de entrar no app.
  const [created, setCreated] = useState<StoreInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  function handleCreate() {
    setFormError(null);
    if (!isValidName(storeName)) {
      setNameError('Informe o nome da sua loja (entre 2 e 120 caracteres).');
      return;
    }
    setNameError(null);

    void run(async () => {
      try {
        setCreated(await createStore(storeName.trim()));
      } catch (error) {
        if (isApiError(error) && error.status === 403) {
          // "Confirme seu e-mail antes de criar a loja." → volta para a tela do código.
          markUnverified();
          return;
        }
        if (isApiError(error) && error.status === 409) {
          // "Você já possui uma loja." → busca o estado real em /me e segue para a home.
          try {
            await refreshMe();
            return;
          } catch (meError) {
            setFormError(getErrorMessage(meError));
            return;
          }
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  async function handleCopy(link: string) {
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError('Não foi possível copiar o link. Tente compartilhar.');
    }
  }

  async function handleShare(store: StoreInfo) {
    try {
      await Share.share({ message: `Conheça a minha loja, ${store.storeName}: ${store.catalogLink}` });
    } catch {
      // Fechar/cancelar o share sheet não é erro.
    }
  }

  if (created) {
    return (
      <AuthScreen topPadding={32}>
        <View className="w-14 h-14 rounded-2xl bg-success items-center justify-center mb-5">
          <Ionicons name="checkmark" size={30} color="#fff" />
        </View>

        <Text className="text-2xl font-extrabold text-ink-900 mb-1">Sua loja está no ar!</Text>
        <Text className="text-sm text-ink-400 mb-6">
          <Text className="font-bold text-ink-700">{created.storeName}</Text> já tem uma vitrine. Compartilhe o link com
          seus clientes.
        </Text>

        {formError && <Banner type="error" message={formError} />}

        <Text className="text-xs font-bold text-ink-500 mb-1.5">Link da sua loja</Text>
        <View className="flex-row items-center bg-white rounded-2xl px-4 h-14 mb-4">
          <Ionicons name="link-outline" size={18} color="#FF6B00" />
          <Text className="flex-1 text-sm font-bold text-primary-600 ml-3" numberOfLines={1} selectable>
            {created.catalogLink.replace(/^https?:\/\//, '')}
          </Text>
        </View>

        <View className="flex-row gap-3 mb-6">
          <Pressable
            onPress={() => void handleCopy(created.catalogLink)}
            className="flex-1"
            accessibilityRole="button"
            accessibilityLabel="Copiar link da loja"
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-center h-12 rounded-2xl bg-white"
                style={{ opacity: pressed ? 0.85 : 1 }}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#FF6B00" />
                <Text className="text-primary-600 font-bold text-sm ml-2">{copied ? 'Copiado!' : 'Copiar'}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => void handleShare(created)}
            className="flex-1"
            accessibilityRole="button"
            accessibilityLabel="Compartilhar link da loja"
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-center h-12 rounded-2xl bg-white"
                style={{ opacity: pressed ? 0.85 : 1 }}
              >
                <Ionicons name="share-social-outline" size={18} color="#FF6B00" />
                <Text className="text-primary-600 font-bold text-sm ml-2">Compartilhar</Text>
              </View>
            )}
          </Pressable>
        </View>

        <PrimaryButton label="Ir para o app" onPress={() => applyStore(created)} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen topPadding={32}>
      <View className="w-14 h-14 rounded-2xl bg-primary-500 items-center justify-center mb-5">
        <Ionicons name="storefront-outline" size={26} color="#fff" />
      </View>

      <Text className="text-2xl font-extrabold text-ink-900 mb-1">Crie sua loja</Text>
      <Text className="text-sm text-ink-400 mb-6">É só o nome — a gente cria o link da sua vitrine pra você</Text>

      {formError && <Banner type="error" message={formError} />}

      <AuthInput
        label="Nome da loja"
        icon="business-outline"
        value={storeName}
        onChangeText={setStoreName}
        error={nameError}
        placeholder="Ex: Leal Perfumaria"
        autoCapitalize="words"
        autoFocus
        maxLength={120}
        editable={!loading}
        onSubmitEditing={handleCreate}
      />

      <PrimaryButton label="Criar Loja" onPress={handleCreate} loading={loading} className="mt-2 mb-6" />

      <Pressable onPress={() => void logout()} hitSlop={8} className="items-center" accessibilityRole="button">
        <Text className="text-sm font-bold text-ink-400">Sair da conta</Text>
      </Pressable>
    </AuthScreen>
  );
}
