import { formatCurrency } from './format';
import { paymentLabel } from './sales';

// O que a mensagem precisa saber da venda (o detalhe da venda tem tudo isso).
type MessageSale = {
  number: number;
  status: 'paid' | 'pending' | 'cancelled';
  customerName: string;
  total: number;
  discount: number;
  couponCode: string | null;
  paymentMethod: Parameters<typeof paymentLabel>[0];
  installments: number | null;
  fulfillment: 'pickup' | 'delivery' | null;
  deliveryAddress: string | null;
  cashChangeFor: number | null;
  items: { productName: string; quantity: number; subtotal: number }[];
};

// "Jasiel Leal" -> "Jasiel".
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function itemLines(sale: MessageSale): string {
  return sale.items.map((item) => `• ${item.quantity}x ${item.productName} — ${formatCurrency(item.subtotal)}`).join('\n');
}

function totalLines(sale: MessageSale): string {
  const lines: string[] = [];
  if (sale.discount > 0) lines.push(`Cupom ${sale.couponCode ?? ''}: −${formatCurrency(sale.discount)}`.replace('  ', ' '));
  lines.push(`Total: ${formatCurrency(sale.total)}`);
  return lines.join('\n');
}

function receiving(sale: MessageSale): string | null {
  if (sale.fulfillment === 'delivery') {
    return sale.deliveryAddress ? `Entrega em: ${sale.deliveryAddress}` : 'Entrega';
  }
  if (sale.fulfillment === 'pickup') return 'Retirada na loja';
  return null;
}

function paying(sale: MessageSale): string {
  const method = paymentLabel(sale.paymentMethod, sale.installments);
  const change = sale.cashChangeFor !== null ? ` (troco para ${formatCurrency(sale.cashChangeFor)})` : '';
  return `Pagamento: ${method}${change}`;
}

// Mensagem pronta para o WhatsApp do cliente, de acordo com a situação do pedido:
//  - a receber: resume o pedido e pergunta se pode confirmar;
//  - recebido: confirma o pagamento e agradece;
//  - cancelado: avisa e deixa a porta aberta para um novo pedido.
export function buildCustomerMessage(sale: MessageSale, storeName: string | null): string {
  const who = firstName(sale.customerName);
  const hello = `Olá, ${who}! ${storeName ? `Aqui é da ${storeName}.` : 'Tudo bem?'}`;

  if (sale.status === 'cancelled') {
    return [
      hello,
      '',
      `Infelizmente o seu pedido #${sale.number} foi cancelado. Se quiser, é só me chamar por aqui para fazer um novo pedido.`,
    ].join('\n');
  }

  if (sale.status === 'paid') {
    return [
      hello,
      '',
      `Confirmamos o pagamento do seu pedido #${sale.number}:`,
      itemLines(sale),
      totalLines(sale),
      '',
      sale.fulfillment === 'delivery'
        ? 'Vamos combinar a entrega por aqui. Agradecemos a compra!'
        : 'Já pode retirar na loja quando quiser. Agradecemos a compra!',
    ].join('\n');
  }

  const receivingLine = receiving(sale);
  return [
    hello,
    '',
    `Recebi o seu pedido #${sale.number}:`,
    itemLines(sale),
    totalLines(sale),
    '',
    ...(receivingLine ? [receivingLine] : []),
    paying(sale),
    '',
    'Posso confirmar o seu pedido?',
  ].join('\n');
}
