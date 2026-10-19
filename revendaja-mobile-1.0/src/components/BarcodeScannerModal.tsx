import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Linking } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
};

export default function BarcodeScannerModal({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (locked) return;
    setLocked(true);
    onScanned(result.data);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setLocked(false)}
    >
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text className="text-white text-center text-sm mt-4 mb-5">
              {permission?.canAskAgain === false
                ? 'A câmera foi negada. Ative a permissão nas configurações do aparelho para escanear o código de barras.'
                : 'Precisamos da sua permissão para usar a câmera e escanear o código de barras.'}
            </Text>
            <Pressable
              // Depois de negar, o sistema não mostra o diálogo de novo (`canAskAgain: false`):
              // chamar `requestPermission()` de novo não faz nada, só trava a tela aqui pra sempre.
              onPress={() => (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())}
              className="bg-primary-500 rounded-full px-5 py-3"
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-sm">
                {permission?.canAskAgain === false ? 'Abrir configurações' : 'Permitir câmera'}
              </Text>
            </Pressable>
          </View>
        )}

        <View className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-5 pt-14">
          <Pressable
            onPress={onClose}
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        {permission?.granted && (
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <View
              style={{ width: 250, height: 150, borderRadius: 16, borderWidth: 2, borderColor: '#FF6B00' }}
            />
            <Text className="text-white text-xs font-bold mt-4">Aponte para o código de barras</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
