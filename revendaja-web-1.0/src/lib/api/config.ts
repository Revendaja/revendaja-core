// URL base da API do Revendaja (o mesmo backend que o app mobile usa).
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Client ID "Web application" do login com Google — mesmo valor do GOOGLE_CLIENT_ID do backend.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export const REQUEST_TIMEOUT_MS = 20000;

// Renova o accessToken antes do request se ele expirar em menos que isso.
export const REFRESH_LEEWAY_MS = 30000;
