// Leva o navegador para uma URL externa (Checkout e portal da Stripe). Fica num módulo próprio para
// os testes poderem trocá-lo: o jsdom não implementa `window.location.assign`.
export function redirectTo(url: string) {
  window.location.assign(url);
}
