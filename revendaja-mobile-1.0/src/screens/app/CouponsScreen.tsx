import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, PrimaryButton } from '../../components/AuthForm';
import { ErrorState } from '../../components/ListStates';
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '../../api/coupons';
import { getErrorMessage } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import type { Coupon, CouponType } from '../../api/types';
import { useSubmitting } from '../../hooks/useSubmitting';
import { useStoreAccessGuard } from '../../products/useStoreAccessGuard';
import {
  couponDetails,
  couponDiscountLabel,
  couponStatus,
  parseExpiryDate,
  type CouponStatusKey,
} from '../../utils/coupons';
import { maskPriceInput, parsePriceInput } from '../../utils/format';
import { maskDate } from '../../utils/sales';
import type { MoreStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'Coupons'>;

const CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

const STATUS_STYLE: Record<CouponStatusKey, { bg: string; text: string }> = {
  active: { bg: 'bg-success-bg', text: 'text-success' },
  off: { bg: 'bg-ink-100', text: 'text-ink-500' },
  expired: { bg: 'bg-danger-bg', text: 'text-danger' },
  exhausted: { bg: 'bg-warning-bg', text: 'text-warning' },
};

const TYPE_OPTIONS: { key: CouponType; label: string }[] = [
  { key: 'percent', label: 'Porcentagem' },
  { key: 'fixed', label: 'Valor fixo' },
];

export default function CouponsScreen({ navigation }: Props) {
  const guard = useStoreAccessGuard();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({ queryKey: queryKeys.coupons(), queryFn: () => guard(() => listCoupons()) });
  const coupons = query.data?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.coupons() });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => guard(() => updateCoupon(id, { isActive })),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Ops!', getErrorMessage(error)),
    onSettled: () => setBusyId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => guard(() => deleteCoupon(id)),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Ops!', getErrorMessage(error)),
    onSettled: () => setBusyId(null),
  });

  function confirmDelete(coupon: Coupon) {
    Alert.alert(`Apagar o cupom ${coupon.code}?`, 'As vendas que já usaram o cupom continuam com o desconto.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          setBusyId(coupon.id);
          deleteMutation.mutate(coupon.id);
        },
      },
    ]);
  }

  function renderCoupon({ item }: { item: Coupon }) {
    const status = couponStatus(item);
    const style = STATUS_STYLE[status.key];
    const busy = busyId === item.id;
    return (
      <View className="bg-white rounded-2xl p-4 mb-3" style={{ elevation: 1 }} accessibilityLabel={`Cupom ${item.code}`}>
        <View className="flex-row items-center">
          <View className="w-11 h-11 rounded-xl bg-primary-50 items-center justify-center mr-3">
            <Ionicons name="ticket-outline" size={20} color="#FF6B00" />
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-base font-extrabold text-ink-900" numberOfLines={1}>
              {item.code}
            </Text>
            <Text className="text-sm text-ink-600 mt-0.5">{couponDiscountLabel(item)}</Text>
          </View>
          <View className={`rounded-full px-2.5 py-1 ${style.bg}`}>
            <Text className={`text-[11px] font-extrabold ${style.text}`}>{status.label}</Text>
          </View>
        </View>

        <Text className="text-xs text-ink-500 mt-3">{couponDetails(item).join(' · ')}</Text>

        <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F5F6FA' }}>
          <View className="flex-row items-center flex-1 pr-2">
            <Switch
              value={item.isActive}
              onValueChange={(isActive) => {
                setBusyId(item.id);
                toggleMutation.mutate({ id: item.id, isActive });
              }}
              disabled={busy}
              accessibilityLabel={`Cupom ${item.code} disponível para os clientes`}
              trackColor={{ false: '#E7E8F2', true: '#1FAA59' }}
              thumbColor="#fff"
            />
            <Text className="text-xs font-semibold text-ink-600 ml-2" numberOfLines={1}>
              Disponível para os clientes
            </Text>
          </View>
          <Pressable
            onPress={() => confirmDelete(item)}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Apagar cupom ${item.code}`}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Ionicons name="trash-outline" size={18} color="#E0453F" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
        <View className="flex-row items-center flex-1 pr-3">
          <Pressable
            className="w-10 h-10 rounded-full bg-white items-center justify-center mr-3"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="arrow-back" size={22} color="#1A1B25" />
          </Pressable>
          <Text className="text-xl font-extrabold text-ink-900" numberOfLines={1}>
            Cupons de desconto
          </Text>
        </View>
        <Pressable
          className="flex-row items-center gap-1.5 bg-white rounded-full pl-3 pr-4 py-2.5"
          onPress={() => setFormOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Novo cupom"
        >
          <Ionicons name="add" size={16} color="#FF6B00" />
          <Text className="text-primary-600 text-xs font-bold">Novo</Text>
        </Pressable>
      </View>

      <FlatList
        data={coupons}
        keyExtractor={(item) => item.id}
        renderItem={renderCoupon}
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        ListHeaderComponent={
          <Text className="text-xs text-ink-400 mb-3">
            O cliente digita o código no carrinho da vitrine e o desconto é aplicado no pedido.
          </Text>
        }
        ListEmptyComponent={
          query.isPending ? (
            <Text className="text-center text-ink-400 mt-10">Carregando...</Text>
          ) : query.isError ? (
            <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : (
            <View className="items-center py-12">
              <Ionicons name="ticket-outline" size={40} color="#C7C9D9" />
              <Text className="text-sm font-semibold text-ink-500 mt-3">Você ainda não tem cupons</Text>
              <Text className="text-xs text-ink-400 mt-1 text-center">Toque em "Novo" para criar o primeiro.</Text>
            </View>
          )
        }
      />

      <NewCouponSheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          void refresh();
        }}
      />
    </SafeAreaView>
  );
}

function NewCouponSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const insets = useSafeAreaInsets();
  const guard = useStoreAccessGuard();
  const { loading, run } = useSubmitting();

  const [code, setCode] = useState('');
  const [type, setType] = useState<CouponType>('percent');
  const [percent, setPercent] = useState('');
  const [fixed, setFixed] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setCode('');
    setType('percent');
    setPercent('');
    setFixed('');
    setMinOrder('');
    setMaxUses('');
    setExpires('');
    setErrors({});
    setFormError(null);
  }

  function close() {
    if (loading) return;
    reset();
    onClose();
  }

  function submit() {
    setFormError(null);
    const next: Record<string, string> = {};

    const cleanCode = code.replace(/\s+/g, '').toUpperCase();
    if (!CODE_PATTERN.test(cleanCode)) next.code = 'Use de 3 a 20 letras, números, "-" ou "_".';

    let value: number | null = null;
    if (type === 'percent') {
      const parsed = /^\d{1,3}$/.test(percent.trim()) ? Number(percent) : NaN;
      if (!(parsed >= 1 && parsed <= 100)) next.value = 'Informe de 1% a 100%.';
      else value = parsed;
    } else {
      value = parsePriceInput(fixed);
      if (value === null || value <= 0) next.value = 'Informe o valor do desconto.';
    }

    let min: number | null = null;
    if (minOrder.trim()) {
      min = parsePriceInput(minOrder);
      if (min === null || min <= 0) next.minOrder = 'Valor inválido.';
    }

    let uses: number | null = null;
    if (maxUses.trim()) {
      uses = /^\d{1,7}$/.test(maxUses.trim()) ? Number(maxUses) : NaN;
      if (!(uses >= 1)) next.maxUses = 'Informe um número a partir de 1.';
    }

    const expiry = parseExpiryDate(expires);
    if (expiry.error) next.expires = expiry.error;

    setErrors(next);
    if (Object.keys(next).length > 0 || value === null) return;

    void run(async () => {
      try {
        await guard(() =>
          createCoupon({ code: cleanCode, type, value, minOrder: min, maxUses: uses, expiresAt: expiry.iso ?? null })
        );
        reset();
        onCreated();
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  const fieldClass = 'bg-ink-50 rounded-xl px-4 h-12 text-sm text-ink-900';
  const borderFor = (key: string) => ({ borderWidth: 1.5, borderColor: errors[key] ? '#E0453F' : 'transparent' });
  const fieldError = (key: string) =>
    errors[key] ? (
      <Text className="text-xs text-danger mt-1.5" accessibilityLiveRegion="polite">
        {errors[key]}
      </Text>
    ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(26,27,37,0.55)' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Fechar" />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="bg-white rounded-t-3xl pt-6" style={{ maxHeight: '92%' }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
            >
              <View className="w-12 h-12 rounded-2xl bg-primary-50 items-center justify-center mb-4">
                <Ionicons name="ticket" size={22} color="#FF6B00" />
              </View>
              <Text className="text-xl font-extrabold text-ink-900 mb-1">Novo cupom</Text>
              <Text className="text-sm text-ink-400 mb-5">O cliente digita o código no carrinho e ganha o desconto.</Text>

              {formError && <Banner type="error" message={formError} className="mb-3" />}

              <Text className="text-xs font-bold text-ink-500 mb-1.5">Código</Text>
              <TextInput
                value={code}
                onChangeText={(text) => {
                  setCode(text.toUpperCase().replace(/\s/g, ''));
                  setErrors((current) => ({ ...current, code: '' }));
                }}
                placeholder="VERAO10"
                placeholderTextColor="#8B8FA3"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                editable={!loading}
                accessibilityLabel="Código do cupom"
                className={fieldClass}
                style={borderFor('code')}
              />
              {fieldError('code')}

              <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Tipo de desconto</Text>
              <View className="flex-row" style={{ gap: 8 }}>
                {TYPE_OPTIONS.map((option) => {
                  const active = option.key === type;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setType(option.key);
                        setErrors((current) => ({ ...current, value: '' }));
                      }}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={`flex-1 h-11 rounded-xl items-center justify-center ${active ? 'bg-primary-500' : 'bg-ink-50'}`}
                    >
                      <Text className={`text-sm font-extrabold ${active ? 'text-white' : 'text-ink-700'}`}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">
                {type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}
              </Text>
              {type === 'percent' ? (
                <TextInput
                  value={percent}
                  onChangeText={(text) => {
                    setPercent(text.replace(/\D/g, '').slice(0, 3));
                    setErrors((current) => ({ ...current, value: '' }));
                  }}
                  placeholder="10"
                  placeholderTextColor="#8B8FA3"
                  keyboardType="number-pad"
                  editable={!loading}
                  accessibilityLabel="Desconto em porcentagem"
                  className={fieldClass}
                  style={borderFor('value')}
                />
              ) : (
                <TextInput
                  value={fixed}
                  onChangeText={(text) => {
                    setFixed(maskPriceInput(text));
                    setErrors((current) => ({ ...current, value: '' }));
                  }}
                  placeholder="0,00"
                  placeholderTextColor="#8B8FA3"
                  keyboardType="number-pad"
                  editable={!loading}
                  accessibilityLabel="Desconto em reais"
                  className={fieldClass}
                  style={borderFor('value')}
                />
              )}
              {fieldError('value')}

              <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Pedido mínimo (opcional)</Text>
              <TextInput
                value={minOrder}
                onChangeText={(text) => {
                  setMinOrder(maskPriceInput(text));
                  setErrors((current) => ({ ...current, minOrder: '' }));
                }}
                placeholder="0,00"
                placeholderTextColor="#8B8FA3"
                keyboardType="number-pad"
                editable={!loading}
                accessibilityLabel="Pedido mínimo"
                className={fieldClass}
                style={borderFor('minOrder')}
              />
              {fieldError('minOrder')}

              <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Limite de usos (opcional)</Text>
              <TextInput
                value={maxUses}
                onChangeText={(text) => {
                  setMaxUses(text.replace(/\D/g, '').slice(0, 7));
                  setErrors((current) => ({ ...current, maxUses: '' }));
                }}
                placeholder="Sem limite"
                placeholderTextColor="#8B8FA3"
                keyboardType="number-pad"
                editable={!loading}
                accessibilityLabel="Limite de usos"
                className={fieldClass}
                style={borderFor('maxUses')}
              />
              {fieldError('maxUses')}

              <Text className="text-xs font-bold text-ink-500 mb-1.5 mt-4">Vale até (opcional)</Text>
              <TextInput
                value={expires}
                onChangeText={(text) => {
                  setExpires(maskDate(text));
                  setErrors((current) => ({ ...current, expires: '' }));
                }}
                placeholder="Não vence — ou DD/MM/AAAA"
                placeholderTextColor="#8B8FA3"
                keyboardType="number-pad"
                maxLength={10}
                editable={!loading}
                accessibilityLabel="Data de validade"
                className={fieldClass}
                style={borderFor('expires')}
              />
              {fieldError('expires')}

              <View className="mt-6">
                <PrimaryButton label="Criar cupom" onPress={submit} loading={loading} />
              </View>
              <Pressable onPress={close} disabled={loading} hitSlop={8} className="items-center mt-4" accessibilityRole="button">
                <Text className="text-sm font-bold text-ink-400">Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
