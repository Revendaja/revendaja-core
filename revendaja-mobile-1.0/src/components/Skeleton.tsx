import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import type { DimensionValue, ViewStyle } from 'react-native';

// Retângulo cinza pulsante: bloco básico pra montar telas de carregamento que já imitam o layout
// real (evita o "pulo" quando os dados chegam, e parece mais rápido que um spinner solto no meio da tela).
export function SkeletonBlock({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: '#E7E8F2', opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

// --- Início (cartão de faturamento + meta) --------------------------------------------------

export function HomeSkeleton() {
  return (
    <View accessibilityLabel="Carregando" importantForAccessibility="yes">
      <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
        <View className="flex-row items-center gap-2 mb-4">
          <SkeletonBlock width={36} height={36} radius={12} />
          <SkeletonBlock width={140} height={12} />
        </View>
        <SkeletonBlock width={160} height={30} radius={8} style={{ marginBottom: 10 }} />
        <SkeletonBlock width={200} height={11} />
      </View>
      <View className="bg-white rounded-2xl p-4 mb-4" style={{ elevation: 1 }}>
        <View className="flex-row items-center justify-between mb-3">
          <SkeletonBlock width={110} height={12} />
          <SkeletonBlock width={30} height={12} />
        </View>
        <SkeletonBlock height={8} radius={999} style={{ marginBottom: 10 }} />
        <SkeletonBlock width={220} height={11} />
      </View>
    </View>
  );
}

// --- Cartão de produto na lista de Estoque (mesmo layout do ProductCard) -------------------

export function ProductCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-3 mb-3" style={{ elevation: 1 }}>
      <View className="flex-row">
        <SkeletonBlock width={80} height={80} radius={12} />
        <View className="flex-1 pl-3">
          <SkeletonBlock width="80%" height={13} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="55%" height={11} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="40%" height={18} />
        </View>
      </View>
      <View className="h-px bg-ink-100 my-3" />
      <View className="flex-row items-center justify-between">
        <SkeletonBlock width={120} height={12} />
        <SkeletonBlock width={80} height={28} radius={999} />
      </View>
    </View>
  );
}

// --- Linha de produto do catálogo global (mesmo layout do CatalogRow) ----------------------

export function CatalogRowSkeleton() {
  return (
    <View className="flex-row items-center bg-white rounded-2xl p-3 mb-3" style={{ elevation: 1 }}>
      <SkeletonBlock width={56} height={56} radius={12} style={{ marginRight: 12 }} />
      <View className="flex-1 pr-2">
        <SkeletonBlock width="35%" height={9} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="70%" height={13} style={{ marginBottom: 6 }} />
        <SkeletonBlock width="50%" height={11} />
      </View>
    </View>
  );
}

// --- Linha de venda/pedido (mesmo layout usado em Finanças, Vendas Online) -----------------

export function SaleRowSkeleton() {
  return (
    <View className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
      <SkeletonBlock width={44} height={44} radius={12} style={{ marginRight: 12 }} />
      <View className="flex-1 pr-2">
        <SkeletonBlock width="55%" height={13} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="40%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <SkeletonBlock width={64} height={13} style={{ marginBottom: 8 }} />
        <SkeletonBlock width={48} height={10} />
      </View>
    </View>
  );
}

// Várias linhas de uma vez, pro estado de carregamento de uma lista (Estoque, catálogo, vendas...).
export function SkeletonRows({
  Row,
  count = 5,
}: {
  Row: React.ComponentType;
  count?: number;
}) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <Row key={index} />
      ))}
    </View>
  );
}

// --- Linhas de configuração (toggles da tela Mais) ----------------------------------------

export function SettingsRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          className="flex-row items-center justify-between py-2.5"
          style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#F5F6FA' } : undefined}
        >
          <SkeletonBlock width="55%" height={13} />
          <SkeletonBlock width={40} height={22} radius={999} />
        </View>
      ))}
    </View>
  );
}

// --- Linha de relatório (mais vendidos / parados) -----------------------------------------

export function ReportRowSkeleton() {
  return (
    <View className="flex-row items-center bg-white rounded-2xl p-3 mb-2.5">
      <SkeletonBlock width={40} height={40} radius={10} style={{ marginRight: 12 }} />
      <View className="flex-1 pr-2">
        <SkeletonBlock width="65%" height={13} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="35%" height={11} />
      </View>
      <SkeletonBlock width={48} height={13} />
    </View>
  );
}

// --- Detalhe de venda --------------------------------------------------------------------

export function SaleDetailSkeleton() {
  return (
    <View>
      <View className="bg-white rounded-2xl p-4 mb-3" style={{ elevation: 1 }}>
        <View className="flex-row items-center">
          <SkeletonBlock width={48} height={48} radius={24} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="60%" height={14} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="45%" height={11} />
          </View>
        </View>
      </View>
      <SkeletonBlock height={40} radius={12} style={{ marginBottom: 16 }} />
      <SkeletonBlock width={110} height={16} style={{ marginBottom: 12 }} />
      <SkeletonRows Row={SaleRowSkeleton} count={2} />
      <SkeletonBlock height={64} radius={16} style={{ marginTop: 4 }} />
    </View>
  );
}
