import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Banner, PrimaryButton } from './AuthForm';
import { getErrorMessage } from '../api/errors';
import { useSubmitting } from '../hooks/useSubmitting';
import { formatCurrencyWhole } from '../utils/format';

// Metas sugeridas, em reais por mês. "Outro valor" deixa o usuário digitar.
const GOAL_PRESETS = [1000, 2500, 5000, 10000, 20000];
// Só inteiros, até 9 dígitos: bem abaixo do teto da API e cabe em qualquer tela.
const CUSTOM_MAX_DIGITS = 9;

type Choice = number | 'custom' | null;

type Props = {
  visible: boolean;
  // false = escolha obrigatória (primeira vez): sem "Cancelar", e tocar fora ou usar o botão voltar não fecha.
  dismissible: boolean;
  // Meta atual, ao trocar: já vem selecionada.
  currentGoal: number | null;
  // Erros são exibidos aqui dentro; se resolver, quem chamou fecha o seletor.
  onSave: (goal: number) => Promise<void>;
  onClose: () => void;
};

export default function GoalPickerModal({ visible, dismissible, currentGoal, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { loading, run } = useSubmitting();
  const [choice, setChoice] = useState<Choice>(null);
  const [custom, setCustom] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Cada abertura recomeça da meta atual (ou sem nada selecionado, na primeira vez).
  useEffect(() => {
    if (!visible) return;
    setFormError(null);
    if (currentGoal === null) {
      setChoice(null);
      setCustom('');
    } else if (GOAL_PRESETS.includes(currentGoal)) {
      setChoice(currentGoal);
      setCustom('');
    } else {
      setChoice('custom');
      setCustom(String(Math.round(currentGoal)));
    }
  }, [visible, currentGoal]);

  const customValue = Number(custom);
  const value = choice === 'custom' ? (customValue >= 1 ? customValue : null) : choice;

  function select(next: Choice) {
    setChoice(next);
    setFormError(null);
  }

  function handleSave() {
    if (value === null) return;
    setFormError(null);
    void run(async () => {
      try {
        await onSave(value);
      } catch (error) {
        setFormError(getErrorMessage(error));
      }
    });
  }

  function renderChip(key: string, label: string, active: boolean, onPress: () => void) {
    return (
      <Pressable
        key={key}
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`px-4 py-3 rounded-xl ${active ? 'bg-primary-500' : 'bg-ink-50'}`}
      >
        <Text className={`text-sm font-extrabold ${active ? 'text-white' : 'text-ink-700'}`}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : () => {}}
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(26,27,37,0.55)' }}>
        {dismissible && (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="bg-white rounded-t-3xl px-5 pt-6" style={{ paddingBottom: insets.bottom + 20 }}>
            <View className="w-12 h-12 rounded-2xl bg-primary-50 items-center justify-center mb-4">
              <Ionicons name="flag" size={22} color="#FF6B00" />
            </View>

            <Text className="text-xl font-extrabold text-ink-900 mb-1">
              {dismissible ? 'Trocar meta de vendas' : 'Qual é a sua meta de vendas?'}
            </Text>
            <Text className="text-sm text-ink-400 mb-5">
              Escolha quanto você quer faturar por mês. O progresso aparece na tela inicial e conta as vendas já
              recebidas.
            </Text>

            <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
              {GOAL_PRESETS.map((preset) =>
                renderChip(String(preset), formatCurrencyWhole(preset), choice === preset, () => select(preset))
              )}
              {renderChip('custom', 'Outro valor', choice === 'custom', () => select('custom'))}
            </View>

            {choice === 'custom' && (
              <View
                className="flex-row items-center bg-ink-50 rounded-xl px-4 h-12 mb-4"
                style={{ borderWidth: 1.5, borderColor: '#FF6B00' }}
              >
                <Text className="text-sm font-bold text-ink-500 mr-2">R$</Text>
                <TextInput
                  value={custom}
                  onChangeText={(text) => {
                    setCustom(text.replace(/\D/g, '').slice(0, CUSTOM_MAX_DIGITS));
                    setFormError(null);
                  }}
                  placeholder="0"
                  placeholderTextColor="#8B8FA3"
                  keyboardType="number-pad"
                  autoFocus
                  editable={!loading}
                  accessibilityLabel="Valor da meta mensal"
                  className="flex-1 text-base font-bold text-ink-900"
                />
              </View>
            )}

            {formError && <Banner type="error" message={formError} className="mb-3" />}

            <PrimaryButton
              label={dismissible ? 'Salvar meta' : 'Definir meta'}
              onPress={handleSave}
              loading={loading}
              disabled={value === null}
            />

            {dismissible && (
              <Pressable
                onPress={onClose}
                disabled={loading}
                hitSlop={8}
                className="items-center mt-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-ink-400">Cancelar</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
