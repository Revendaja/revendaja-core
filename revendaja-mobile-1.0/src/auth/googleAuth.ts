import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Mesmo Client ID tipo "Web application" que o backend usa como GOOGLE_CLIENT_ID (audience do
// idToken). É assim que o SDK nativo (Android/iOS) consegue emitir um idToken que o backend sabe
// validar — ver revendaja-backend-1.0/src/modules/auth/google.ts.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Login com Google não configurado (falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no .env.local).',
    );
  }
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

// null = a usuária cancelou o seletor de contas — não é erro, não deve mostrar aviso nenhum.
export async function signInWithGoogle(): Promise<string | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled') return null;

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('O Google não retornou um idToken.');
  return idToken;
}
