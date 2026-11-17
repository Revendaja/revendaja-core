import { describe, expect, it } from 'vitest';
import { buildCustomerMessage } from './saleMessage';
import { whatsappUrl } from './format';

const sale = {
  number: 388,
  status: 'pending' as const,
  customerName: 'Jasiel Leal',
  total: 107.07,
  discount: 0,
  couponCode: null,
  paymentMethod: 'cash' as const,
  installments: null,
  fulfillment: 'pickup' as const,
  deliveryAddress: null,
  cashChangeFor: null,
  items: [
    { productName: 'Imari Corset Eau de Toilette - 50 ml', quantity: 1, subtotal: 72.17 },
    { productName: 'Kit Florasense Jequiti 1 un', quantity: 2, subtotal: 34.9 },
  ],
};

const norm = (text: string) => text.replace(/\u00a0/g, ' ');

describe('buildCustomerMessage', () => {
  it('pedido a receber: cumprimenta pelo primeiro nome, resume itens, total, retirada e pagamento', () => {
    const message = norm(buildCustomerMessage(sale, 'Leal Perfumaria'));

    expect(message).toContain('Olá, Jasiel! Aqui é da Leal Perfumaria.');
    expect(message).toContain('Recebi o seu pedido #388:');
    expect(message).toContain('• 1x Imari Corset Eau de Toilette - 50 ml — R$ 72,17');
    expect(message).toContain('• 2x Kit Florasense Jequiti 1 un — R$ 34,90');
    expect(message).toContain('Total: R$ 107,07');
    expect(message).toContain('Retirada na loja');
    expect(message).toContain('Pagamento: Dinheiro em mãos');
    expect(message.trimEnd().endsWith('Posso confirmar o seu pedido?')).toBe(true);
  });

  it('entrega: leva o endereço; dinheiro com troco avisa o valor', () => {
    const message = norm(
      buildCustomerMessage(
        { ...sale, fulfillment: 'delivery', deliveryAddress: 'Rua das Flores, 100, Centro', cashChangeFor: 200 },
        'Leal',
      ),
    );

    expect(message).toContain('Entrega em: Rua das Flores, 100, Centro');
    expect(message).toContain('troco para R$ 200,00');
    expect(message).not.toContain('Retirada na loja');
  });

  it('cartão parcelado mostra as parcelas', () => {
    const message = buildCustomerMessage({ ...sale, paymentMethod: 'card', installments: 3 }, 'Leal');

    expect(message).toContain('Pagamento: Cartão 3x');
  });

  it('com cupom: mostra o desconto antes do total', () => {
    const message = norm(buildCustomerMessage({ ...sale, discount: 10.7, couponCode: 'VERAO10', total: 96.37 }, 'Leal'));

    expect(message).toMatch(/Cupom VERAO10: −R\$ 10,70\nTotal: R\$ 96,37/);
  });

  it('pedido recebido: confirma o pagamento e orienta retirada ou entrega', () => {
    const pickup = buildCustomerMessage({ ...sale, status: 'paid' }, 'Leal');
    const delivery = buildCustomerMessage({ ...sale, status: 'paid', fulfillment: 'delivery' }, 'Leal');

    expect(pickup).toContain('Confirmamos o pagamento do seu pedido #388');
    expect(pickup).toContain('Já pode retirar na loja');
    expect(delivery).toContain('Vamos combinar a entrega');
    expect(pickup).not.toContain('Posso confirmar');
  });

  it('pedido cancelado: avisa e convida a fazer outro', () => {
    const message = buildCustomerMessage({ ...sale, status: 'cancelled' }, 'Leal');

    expect(message).toContain('o seu pedido #388 foi cancelado');
    expect(message).not.toContain('Total:');
  });

  it('sem nome da loja: cumprimento genérico, sem "Aqui é da"', () => {
    const message = buildCustomerMessage(sale, null);

    expect(message.startsWith('Olá, Jasiel! Tudo bem?')).toBe(true);
    expect(message).not.toContain('Aqui é da');
  });
});

describe('whatsappUrl com mensagem', () => {
  it('sem mensagem, só o número (com o 55 do Brasil)', () => {
    expect(whatsappUrl('84992092241')).toBe('https://wa.me/5584992092241');
  });

  it('com mensagem, vai codificada em ?text=', () => {
    const url = whatsappUrl('84992092241', 'Olá, Ana!\nTotal: R$ 10,00');

    expect(url).toBe('https://wa.me/5584992092241?text=Ol%C3%A1%2C%20Ana!%0ATotal%3A%20R%24%2010%2C00');
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('Olá, Ana!\nTotal: R$ 10,00');
  });
});
