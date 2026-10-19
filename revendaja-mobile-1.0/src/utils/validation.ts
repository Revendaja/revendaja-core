// Mesmo padrão de e-mail que o backend valida (OpenAPI), para o cliente quase nunca receber VALIDATION_ERROR.
const EMAIL_PATTERN = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

// O backend não normaliza: "Ana@x.com" e "ana@x.com" seriam contas diferentes.
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

export function isValidPassword(value: string) {
  return value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX;
}

export function isValidName(value: string, min = 2, max = 120) {
  const length = value.trim().length;
  return length >= min && length <= max;
}

// ---------------------------------------------------------------------------
// WhatsApp brasileiro: a UI mostra "(11) 98221-4432" e a API recebe só dígitos com DDI ("5511982214432").
// ---------------------------------------------------------------------------

const COUNTRY_CODE = '55';

// `previous` distingue digitação (1 dígito por vez) de colagem de um número já com DDI (+55).
export function maskWhatsapp(text: string, previous = '') {
  let digits = text.replace(/\D/g, '');
  const previousDigits = previous.replace(/\D/g, '');
  const isPaste = digits.length - previousDigits.length > 1;

  if (isPaste && digits.length > 11 && digits.startsWith(COUNTRY_CODE)) digits = digits.slice(COUNTRY_CODE.length);
  digits = digits.slice(0, 11);

  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// DDD (2 dígitos, sem zero à esquerda) + 8 ou 9 dígitos.
export function isValidWhatsapp(masked: string) {
  return /^[1-9]\d{9,10}$/.test(masked.replace(/\D/g, ''));
}

export function toApiWhatsapp(masked: string) {
  return `${COUNTRY_CODE}${masked.replace(/\D/g, '')}`;
}

// "5511982214432" -> "(11) 98221-4432"
export function formatWhatsappFromApi(apiDigits: string) {
  const digits = apiDigits.replace(/\D/g, '');
  const national = digits.length > 11 && digits.startsWith(COUNTRY_CODE) ? digits.slice(COUNTRY_CODE.length) : digits;
  return maskWhatsapp(national);
}
