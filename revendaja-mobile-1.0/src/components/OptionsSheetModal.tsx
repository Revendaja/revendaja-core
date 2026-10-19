import React from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type SheetOption = { key: string; label: string; sublabel?: string };

type Props = {
  visible: boolean;
  title: string;
  options: SheetOption[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  footer?: React.ReactNode;
  emptyLabel?: string;
};

// Modal de escolha genérico (lista de opções, uma marcada por vez) — mesmo padrão visual de
// ComponentPickerModal/BarcodeScannerModal: tela cheia com padding fixo no topo (SafeAreaView não
// respeita a área segura dentro de um Modal nesse app). Usado pra ordenação do Estoque, categoria
// (filtro e atribuição a um produto) e a escolha câmera/galeria no cadastro manual.
export default function OptionsSheetModal({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  footer,
  emptyLabel = 'Nenhuma opção disponível.',
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-ink-50">
        <View className="flex-row items-center justify-between px-5 pt-14 pb-2">
          <Text className="text-lg font-extrabold text-ink-900">{title}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
          >
            <Ionicons name="close" size={20} color="#1A1B25" />
          </Pressable>
        </View>
        <FlatList
          data={options}
          keyExtractor={(option) => option.key}
          contentContainerStyle={{ padding: 20, paddingTop: 8, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text className="text-center text-sm text-ink-400 mt-10">{emptyLabel}</Text>}
          ListFooterComponent={footer ? <View className="mt-2">{footer}</View> : null}
          renderItem={({ item }) => {
            const active = item.key === selectedKey;
            return (
              <Pressable
                onPress={() => onSelect(item.key)}
                className="flex-row items-center justify-between bg-white rounded-2xl px-4 py-3.5 mb-2.5"
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-ink-900">{item.label}</Text>
                  {item.sublabel && <Text className="text-xs text-ink-400 mt-0.5">{item.sublabel}</Text>}
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color="#FF6B00" />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
