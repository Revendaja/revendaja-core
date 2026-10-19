import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import { useAuth } from '../../auth/AuthContext';
import { getErrorMessage, isApiError } from '../../api/errors';
import { updateStore } from '../../api/stores';
import type { StoreChanges } from '../../api/stores';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'EditStore'>;

// Mesmas regras da API: não há campo de link separado — o handle é sempre o nome
// da loja "traduzido" (sem espaço, acento ou maiúscula), igual à criação da loja.
const NAME_MIN = 2;
const NAME_MAX = 120;
const HANDLE_MIN = 3;
const HANDLE_MAX = 63;
const BIO_MAX = 280;

const NAME_ERROR = `Informe o nome da sua loja (entre ${NAME_MIN} e ${NAME_MAX} caracteres).`;
const NAME_TOO_SHORT_FOR_LINK = 'Esse nome gera um link muito curto. Adicione mais letras ou números.';

// Mesma regra do backend ao criar a loja: só letras minúsculas e números (sem espaço, acento ou hífen).
function slugifyName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, HANDLE_MAX);
}

export default function EditStoreScreen({ navigation }: Props) {
  const { store, applyStore } = useAuth();
  const guard = useStoreAccessGuard();
  const { loading, run } = useSubmitting();

  const [storeName, setStoreName] = useState(store?.storeName ?? '');
  const [bio, setBio] = useState(store?.bio ?? '');
  const [defaultMinStock, setDefaultMinStock] = useState(String(store?.defaultMinStock ?? 0));
  const [nameError, setNameError] = useState<string | null>(null);
  const [minStockError, setMinStockError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ".revendaja.com": vem do link que a API devolveu, para não ficar fixo no app.
  const domainSuffix = store ? store.catalogLink.replace(/^https?:\/\/[^.]+/, '') : '.revendaja.com';

  // O link da vitrine acompanha o nome em tempo real: não existe campo separado para editá-lo.
  const handle = slugifyName(storeName);

  // Valida como a API e devolve só o que mudou (null = há erro na tela).
  function buildChanges(): StoreChanges | null {
    if (!store) return null;

    const name = storeName.trim();
    const nameOk = name.length >= NAME_MIN && name.length <= NAME_MAX;
    const linkOk = handle.length >= HANDLE_MIN;
    const minStockValue = Number(defaultMinStock);
    const minStockOk = defaultMinStock.trim() !== '' && Number.isInteger(minStockValue) && minStockValue >= 0;
    setNameError(!nameOk ? NAME_ERROR : !linkOk ? NAME_TOO_SHORT_FOR_LINK : null);
    setMinStockError(!minStockOk ? 'Informe um número válido (0 ou mais).' : null);
    if (!nameOk || !linkOk || !minStockOk) return null;

    const changes: StoreChanges = {};
    if (name !== store.storeName) changes.storeName = name;
    // Só manda handle novo se o NOME mudou de fato: compara com o slug do nome ATUAL salvo, não com
    // `store.handle` puro. O handle salvo pode ter um sufixo de desempate (ex.: "leal-2", quando
    // "leal" já estava em uso na hora da criação) que nunca bate 1:1 com o nome — comparar direto
    // com `store.handle` disparava a troca de link (e o alerta de confirmação) mesmo sem editar nada.
    if (handle !== slugifyName(store.storeName)) changes.handle = handle;
    // Descrição vazia limpa a que existia.
    if (bio.trim() !== (store.bio ?? '')) changes.bio = bio.trim();
    if (minStockValue !== store.defaultMinStock) changes.defaultMinStock = minStockValue;
    return changes;
  }

  function save(changes: StoreChanges) {
    void run(async () => {
      try {
        const updated = await guard(() => updateStore(changes));
        // Mantém a sessão (e as telas Minha Loja e Mais) em sincronia com o que o servidor gravou.
        applyStore(updated);
        navigation.goBack();
      } catch (error) {
        if (isApiError(error) && error.code === 'HANDLE_UNAVAILABLE') {
          setNameError('Já existe uma loja com um nome parecido. Tente outro nome.');
          return;
        }
        setFormError(getErrorMessage(error));
      }
    });
  }

  function handleSave() {
    setFormError(null);
    const changes = buildChanges();
    if (!changes || !store) return;

    // Nada mudou: não há o que salvar.
    if (Object.keys(changes).length === 0) {
      navigation.goBack();
      return;
    }

    // Trocar o nome troca o link da vitrine junto: derruba o endereço antigo. Confirma antes.
    if (changes.handle) {
      Alert.alert(
        'Trocar o link da vitrine?',
        `O endereço atual (${store.handle}${domainSuffix}) deixa de funcionar. Quem tiver o link antigo não vai encontrar a sua loja.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Trocar link', style: 'destructive', onPress: () => save(changes) },
        ]
      );
      return;
    }

    save(changes);
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            <Text className="text-lg font-extrabold text-ink-900">Editar Loja</Text>
            <View className="w-10 h-10" />
          </View>

          {formError && <Banner type="error" message={formError} />}

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Nome da loja</Text>
          <TextInput
            value={storeName}
            onChangeText={(text) => {
              setStoreName(text);
              if (nameError) setNameError(null);
            }}
            placeholder="Ex: Juliana Beauty"
            placeholderTextColor="#8B8FA3"
            maxLength={NAME_MAX}
            editable={!loading}
            accessibilityLabel="Nome da loja"
            className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900"
            style={{ borderWidth: 1.5, borderColor: nameError ? '#E0453F' : 'transparent' }}
          />
          {nameError && (
            <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
              {nameError}
            </Text>
          )}

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Link da vitrine</Text>
          <View className="flex-row items-center bg-white rounded-xl px-4 h-12 opacity-70">
            <Ionicons name="link-outline" size={16} color="#8B8FA3" />
            <Text className="flex-1 text-sm text-ink-700 ml-2" numberOfLines={1}>
              {handle || 'sualoja'}
              {domainSuffix}
            </Text>
          </View>
          <Text className="text-xs text-ink-400 mt-1.5">O link é sempre o nome da sua loja — muda junto com ele.</Text>

          <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Descrição da loja (opcional)</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Uma frase curta sobre o que você vende..."
            placeholderTextColor="#8B8FA3"
            multiline
            numberOfLines={3}
            maxLength={BIO_MAX}
            editable={!loading}
            accessibilityLabel="Descrição da loja"
            className="bg-white rounded-xl px-4 py-3 text-sm text-ink-900"
            style={{ minHeight: 76, textAlignVertical: 'top' }}
          />
          <View className="flex-row items-start justify-between mt-1.5 mb-6">
            <Text className="text-xs text-ink-400 flex-1 pr-2">Aparece no topo da sua vitrine virtual.</Text>
            <Text className="text-xs text-ink-400">
              {bio.length}/{BIO_MAX}
            </Text>
          </View>

          <Text className="text-xs font-bold text-ink-500 mb-1.5">Estoque mínimo padrão</Text>
          <TextInput
            value={defaultMinStock}
            onChangeText={(text) => {
              setDefaultMinStock(text.replace(/[^0-9]/g, ''));
              if (minStockError) setMinStockError(null);
            }}
            placeholder="0"
            placeholderTextColor="#8B8FA3"
            keyboardType="number-pad"
            editable={!loading}
            accessibilityLabel="Estoque mínimo padrão"
            className="bg-white rounded-xl px-4 h-12 text-sm text-ink-900"
            style={{ borderWidth: 1.5, borderColor: minStockError ? '#E0453F' : 'transparent' }}
          />
          {minStockError ? (
            <Text className="text-xs text-danger mt-1.5 mb-6" accessibilityLiveRegion="polite">
              {minStockError}
            </Text>
          ) : (
            <Text className="text-xs text-ink-400 mt-1.5 mb-6">
              Todo produto novo já nasce com esse mínimo configurado, e você recebe o alerta de estoque baixo sem
              precisar configurar produto por produto. Também atualiza quem já está cadastrado e ainda não tem um
              mínimo próprio configurado. 0 = desligado.
            </Text>
          )}

          <PrimaryButton label="Salvar Alterações" onPress={handleSave} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
