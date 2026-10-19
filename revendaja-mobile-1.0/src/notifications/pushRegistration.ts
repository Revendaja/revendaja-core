import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { registerDeviceToken, unregisterDeviceToken } from '../api/notifications';

// Desde a SDK 53, o Expo Go nem carrega a parte de push do expo-notifications — só um development
// build (ou build de produção) suporta. O problema não é só CHAMAR uma função de push: o próprio
// `import` estático de "expo-notifications" já registra um listener nativo na hora (visível no
// stack trace como `addPushTokenListener`) e lança antes de qualquer try/catch. Por isso o módulo
// é importado de forma DINÂMICA (`import(...)`), só quando já sabemos que não estamos no Expo Go —
// um `import` normal no topo do arquivo carregaria (e quebraria) sempre, mesmo no Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Guarda o último token já registrado nesta sessão do app: evita registrar de novo à toa (ex.: o
// app volta do background) e é o que `unregisterPushToken` usa pra saber o que remover no logout.
let lastRegisteredToken: string | null = null;
let handlerConfigured = false;

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

// Só LÊ a permissão atual do sistema, sem pedir nada (sem popup) — usado pelo switch "Notificações
// push" (tela Mais) pra saber o estado real ao abrir a tela, em vez de assumir "ligado" sempre.
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (isExpoGo || !Device.isDevice) return 'unsupported';
  try {
    const Notifications = await loadNotifications();
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'unsupported';
  }
}

async function loadNotifications() {
  const Notifications = await import('expo-notifications');

  if (!handlerConfigured) {
    // Notificação recebida com o app aberto: mostra normalmente (banner + som), sem alterar o
    // badge (a contagem de não lidas já vem de GET /notifications/unread-count, não do badge do SO).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }

  return Notifications;
}

// Pede permissão, gera o token Expo do aparelho e registra no backend (`POST
// /notifications/device-tokens`). Nunca lança: falha de push não pode travar o login/app — só
// loga um aviso pra debugar. Chamado pelo AuthContext sempre que o status vira "signedIn".
export async function registerPushToken(): Promise<void> {
  try {
    // Expo Go não suporta push remoto (ver comentário no topo do arquivo) — sai ANTES de importar
    // o expo-notifications. Uma vez rodando num development/production build, isso deixa de ser
    // true e o registro acontece normalmente.
    if (isExpoGo) {
      console.warn('[push] Ignorado: rodando no Expo Go (sem suporte a push desde a SDK 53).');
      return;
    }

    // Simulador/emulador não gera um token de push de verdade.
    if (!Device.isDevice) {
      console.warn('[push] Ignorado: rodando em simulador/emulador, não em aparelho físico.');
      return;
    }

    const Notifications = await loadNotifications();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    const finalStatus =
      existingStatus === 'granted' ? existingStatus : (await Notifications.requestPermissionsAsync()).status;
    if (finalStatus !== 'granted') {
      console.warn('[push] Permissão de notificação negada pelo usuário ou pelo sistema:', finalStatus);
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Exigido pelo Expo desde que o envio de push passou a depender de um projeto EAS
    // (expo.dev). Sem `eas init` rodado no projeto, não tem como gerar o token.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        '[push] Sem projectId do EAS configurado (rode `eas init`) — não é possível gerar o token de push.'
      );
      return;
    }

    console.warn('[push] Gerando token Expo... (projectId:', projectId, ')');
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.warn('[push] Token gerado:', token);
    if (token === lastRegisteredToken) return;

    await registerDeviceToken({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    lastRegisteredToken = token;
    console.warn('[push] Token registrado no backend com sucesso.');
  } catch (error) {
    console.warn('[push] Falha ao registrar o token de push:', error);
  }
}

// Best-effort: remove o token do backend no logout. Nunca lança (o logout local vale de qualquer
// jeito, mesmo se essa chamada falhar).
export async function unregisterPushToken(): Promise<void> {
  const token = lastRegisteredToken;
  if (!token) return;
  lastRegisteredToken = null;
  try {
    await unregisterDeviceToken(token);
  } catch (error) {
    console.warn('[push] Falha ao remover o token de push no logout:', error);
  }
}
