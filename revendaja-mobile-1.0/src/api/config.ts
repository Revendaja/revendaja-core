import { Platform } from 'react-native';

// No emulador Android o "localhost" é o próprio emulador; o host da máquina é 10.0.2.2.
// Em aparelho físico, defina EXPO_PUBLIC_API_URL com o IP da máquina na rede (ex.: http://192.168.0.10:3000).
const DEFAULT_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

export const REQUEST_TIMEOUT_MS = 20000;

// Renova o accessToken antes do request se ele expirar em menos que isso.
export const REFRESH_LEEWAY_MS = 30000;
