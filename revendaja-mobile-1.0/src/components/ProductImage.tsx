import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Imagem de produto com placeholder: cerca de 4% dos produtos não têm imagem, e URLs podem falhar ao carregar.
export default function ProductImage({
  uri,
  style,
  iconSize = 28,
  iconName = 'image-outline',
  iconColor = '#C7C9D9',
  resizeMode = 'contain',
}: {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  resizeMode?: 'contain' | 'cover';
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View style={[{ backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode={resizeMode}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      )}
    </View>
  );
}
