const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Decodifica base64url sem depender de atob (nem todo runtime expõe, ex.: SSR).
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of base64) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) throw new Error('base64 inválido');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

// Lê o "exp" do payload do JWT (sem validar assinatura). Retorna em milissegundos, ou null se ilegível.
export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const { exp } = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}
