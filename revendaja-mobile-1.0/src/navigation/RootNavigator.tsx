import React, { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import VerifyOtpScreen from '../screens/auth/VerifyOtpScreen';
import CreateStoreScreen from '../screens/auth/CreateStoreScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import SplashScreen from '../screens/auth/SplashScreen';
import ConnectionErrorScreen from '../screens/auth/ConnectionErrorScreen';
import HomeScreen from '../screens/app/HomeScreen';
import NotificationsScreen from '../screens/app/NotificationsScreen';
import CatalogScreen from '../screens/app/CatalogScreen';
import ProductDetailScreen from '../screens/app/ProductDetailScreen';
import NewProductScreen from '../screens/app/NewProductScreen';
import ProductFormScreen from '../screens/app/ProductFormScreen';
import ManualProductFormScreen from '../screens/app/ManualProductFormScreen';
import NewSaleScreen from '../screens/app/NewSaleScreen';
import SalesScreen from '../screens/app/SalesScreen';
import SaleDetailScreen from '../screens/app/SaleDetailScreen';
import ReportsScreen from '../screens/app/ReportsScreen';
import ClientDetailScreen from '../screens/app/ClientDetailScreen';
import StoreScreen from '../screens/app/StoreScreen';
import EditStoreScreen from '../screens/app/EditStoreScreen';
import OnlineSalesScreen from '../screens/app/OnlineSalesScreen';
import MoreScreen from '../screens/app/MoreScreen';
import AccountScreen from '../screens/app/AccountScreen';
import PlansScreen from '../screens/app/PlansScreen';
import SubscriptionScreen from '../screens/app/SubscriptionScreen';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { queryKeys } from '../api/queryKeys';
import { getHome } from '../api/home';
import { getSalesSummary, listSales, SALES_PAGE_SIZE } from '../api/sales';
import { getStoreSettings } from '../api/stores';
import { listStoreProducts, STORE_PRODUCTS_PAGE_SIZE } from '../api/storeProducts';
import { StoreProductsProvider } from '../products/StoreProductsContext';
import { useStoreAccessGuard } from '../products/useStoreAccessGuard';
import { periodRange } from '../utils/sales';
import type {
  EstoqueStackParamList,
  FinancasStackParamList,
  HomeStackParamList,
  MoreStackParamList,
  RootStackParamList,
  RootTabParamList,
} from './types';

const RootStackNav = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const EstoqueStackNav = createNativeStackNavigator<EstoqueStackParamList>();
const FinancasStackNav = createNativeStackNavigator<FinancasStackParamList>();
const MoreStackNav = createNativeStackNavigator<MoreStackParamList>();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeHome" component={HomeScreen} />
    </HomeStackNav.Navigator>
  );
}

function EstoqueStack() {
  return (
    <EstoqueStackNav.Navigator screenOptions={{ headerShown: false }}>
      <EstoqueStackNav.Screen name="CatalogList" component={CatalogScreen} />
      <EstoqueStackNav.Screen name="ProductDetail" component={ProductDetailScreen} />
      <EstoqueStackNav.Screen name="NewProduct" component={NewProductScreen} />
      <EstoqueStackNav.Screen name="ProductForm" component={ProductFormScreen} />
      <EstoqueStackNav.Screen name="ManualProductForm" component={ManualProductFormScreen} />
    </EstoqueStackNav.Navigator>
  );
}

function FinancasStack() {
  return (
    <FinancasStackNav.Navigator screenOptions={{ headerShown: false }}>
      <FinancasStackNav.Screen name="SalesList" component={SalesScreen} />
      <FinancasStackNav.Screen name="SaleDetail" component={SaleDetailScreen} />
      <FinancasStackNav.Screen name="Reports" component={ReportsScreen} />
    </FinancasStackNav.Navigator>
  );
}

function MoreStack() {
  return (
    <MoreStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MoreStackNav.Screen name="MoreHome" component={MoreScreen} />
      <MoreStackNav.Screen name="Account" component={AccountScreen} />
      <MoreStackNav.Screen name="Plans" component={PlansScreen} />
      <MoreStackNav.Screen name="Subscription" component={SubscriptionScreen} />
      <MoreStackNav.Screen name="StoreHome" component={StoreScreen} />
      <MoreStackNav.Screen name="EditStore" component={EditStoreScreen} />
      <MoreStackNav.Screen name="OnlineSales" component={OnlineSalesScreen} />
      <MoreStackNav.Screen name="SaleDetail" component={SaleDetailScreen} />
      <MoreStackNav.Screen name="ClientDetail" component={ClientDetailScreen} />
    </MoreStackNav.Navigator>
  );
}

function CenterTabButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        style={{
          top: -20,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: '#FF6B00',
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#FF6B00',
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'grid',
  EstoqueStack: 'cube',
  NovaVenda: 'add-circle',
  FinancasStack: 'bar-chart',
  MoreStack: 'ellipsis-horizontal-circle',
};

const OUTLINE_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'grid-outline',
  EstoqueStack: 'cube-outline',
  NovaVenda: 'add-circle-outline',
  FinancasStack: 'bar-chart-outline',
  MoreStack: 'ellipsis-horizontal-circle-outline',
};

const LABELS: Record<keyof RootTabParamList, string> = {
  Home: 'Início',
  EstoqueStack: 'Estoque',
  NovaVenda: 'Vender',
  FinancasStack: 'Finanças',
  MoreStack: 'Mais',
};

function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  // O Android costuma devolver um `insets.bottom` menor (ou zero, em navegação por botões) do que
  // o iOS devolve pra área do home indicator — usar só o inset deixa a barra "colada" embaixo, sem
  // respiro. Um piso próprio pro Android garante folga mesmo quando o inset vem baixo.
  const bottomPadding =
    Platform.OS === 'android' ? Math.max(insets.bottom, 20) + 14 : insets.bottom > 0 ? insets.bottom + 6 : 8;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FF6B00',
        tabBarInactiveTintColor: '#8B8FA3',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E7E8F2',
          borderTopWidth: 1,
          height: 56 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={focused ? ICONS[route.name] : OUTLINE_ICONS[route.name]}
            size={size ?? 22}
            color={color}
          />
        ),
        tabBarLabel: LABELS[route.name],
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="EstoqueStack" component={EstoqueStack} />
      <Tab.Screen
        name="NovaVenda"
        component={NewSaleScreen}
        options={{ tabBarButton: CenterTabButton, tabBarLabel: () => null }}
      />
      <Tab.Screen name="FinancasStack" component={FinancasStack} />
      <Tab.Screen name="MoreStack" component={MoreStack} />
    </Tab.Navigator>
  );
}

// A lista "Meus produtos" vive enquanto o app logado está aberto e some junto ao sair da conta.
function MainTabs() {
  const queryClient = useQueryClient();
  const guard = useStoreAccessGuard();

  // Início, Estoque, Finanças e Mais já ficam com dado pronto assim que a sessão loga, em paralelo:
  // abrir qualquer uma delas pela primeira vez não mostra skeleton, porque a tela usa a MESMA chave
  // desse prefetch (o TanStack Query encontra o cache já preenchido).
  useEffect(() => {
    const now = new Date();
    const { from, to } = periodRange('month', now.getMonth(), now);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    void queryClient.prefetchQuery({ queryKey: queryKeys.home(), queryFn: () => guard(() => getHome(new Date())) });
    void queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.storeProducts.list(''),
      queryFn: ({ pageParam }) => guard(() => listStoreProducts(pageParam, STORE_PRODUCTS_PAGE_SIZE)),
      initialPageParam: 1,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.storeSettings(),
      queryFn: () => guard(() => getStoreSettings()),
    });
    void queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.sales.list({ from: fromIso, to: toIso }),
      queryFn: ({ pageParam }) =>
        guard(() => listSales({ from: fromIso, to: toIso, page: pageParam, pageSize: SALES_PAGE_SIZE })),
      initialPageParam: 1,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.sales.summary({ from: fromIso, to: toIso }),
      queryFn: () => guard(() => getSalesSummary({ from: fromIso, to: toIso })),
    });
    // Só uma vez, ao logar: cada tela mantém o próprio cache atualizado depois disso (useRefetchOnFocus,
    // invalidação nas mutações).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StoreProductsProvider>
      <MainTabNavigator />
    </StoreProductsProvider>
  );
}

export default function RootNavigator() {
  const { status, user, isVerified, store, bootError, entryRoute, retryBootstrap, loginWithGoogle, logout } =
    useAuth();

  // Abrindo o app: GET /me decide a tela. Sem conexão, oferece tentar de novo (sem deslogar).
  if (status === 'loading') return <SplashScreen />;
  if (status === 'bootError') {
    return (
      <ConnectionErrorScreen
        message={bootError ?? undefined}
        onRetry={() => void retryBootstrap()}
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <RootStackNav.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={status === 'signedOut' ? entryRoute : undefined}
    >
      {status === 'signedOut' ? (
        <>
          <RootStackNav.Screen name="Welcome">
            {({ navigation }) => (
              <WelcomeScreen
                onNavigateToLogin={() => navigation.navigate('Login')}
                onNavigateToRegister={() => navigation.navigate('Register')}
              />
            )}
          </RootStackNav.Screen>
          <RootStackNav.Screen name="Login">
            {({ navigation }) => (
              <LoginScreen
                onNavigateToRegister={() => navigation.navigate('Register')}
                onNavigateToForgotPassword={() => navigation.navigate('ForgotPassword')}
                onGoogleLogin={loginWithGoogle}
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Welcome'))}
              />
            )}
          </RootStackNav.Screen>
          <RootStackNav.Screen name="Register">
            {({ navigation }) => (
              <RegisterScreen
                onNavigateToLogin={() => navigation.navigate('Login')}
                onGoogleLogin={loginWithGoogle}
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Welcome'))}
              />
            )}
          </RootStackNav.Screen>
          <RootStackNav.Screen name="ForgotPassword">
            {({ navigation }) => (
              <ForgotPasswordScreen
                onCodeSent={(email) => navigation.navigate('ResetPassword', { email })}
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
              />
            )}
          </RootStackNav.Screen>
          <RootStackNav.Screen name="ResetPassword">
            {({ navigation, route }) => (
              <ResetPasswordScreen
                email={route.params.email}
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ForgotPassword'))}
                onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
              />
            )}
          </RootStackNav.Screen>
        </>
      ) : !user?.whatsapp ? (
        <RootStackNav.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      ) : !isVerified ? (
        <RootStackNav.Screen name="VerifyOtp" component={VerifyOtpScreen} />
      ) : !store ? (
        <RootStackNav.Screen name="CreateStore" component={CreateStoreScreen} />
      ) : (
        <>
          <RootStackNav.Screen name="Main" component={MainTabs} />
          {/* Fora das abas de propósito: abre por cima da navbar e não fica presa numa aba (ver
          navigation/types.ts). */}
          <RootStackNav.Screen name="Notifications" component={NotificationsScreen} />
        </>
      )}
    </RootStackNav.Navigator>
  );
}
