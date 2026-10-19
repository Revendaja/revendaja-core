import {
  BRAND_NAME,
  escapeHtml,
  firstName,
  heading,
  orderedList,
  paragraph,
  renderLayout,
  renderText,
  type RenderedEmail,
} from './layout';

interface WelcomeEmailData {
  name: string;
}

const STEPS = [
  'Crie a sua loja — o link público é gerado automaticamente a partir do nome.',
  'Importe produtos do catálogo e defina o seu próprio preço em cada um.',
  'Compartilhe o link da loja com as suas clientes.',
];

// Enviado quando a usuária confirma o código de verificação.
export function welcomeEmail({ name }: WelcomeEmailData): RenderedEmail {
  const greeting = firstName(name);
  const subject = `Boas-vindas ao ${BRAND_NAME}, ${greeting}!`;

  const html = renderLayout({
    title: subject,
    preheader: 'Sua conta está confirmada. Veja como começar a vender.',
    bodyHtml: [
      heading(`Boas-vindas, ${greeting}!`),
      paragraph(
        `Sua conta no <strong>${BRAND_NAME}</strong> está confirmada. Para começar a vender:`,
      ),
      orderedList(STEPS.map(escapeHtml)),
      paragraph('Bons negócios!'),
    ].join(''),
  });

  const text = renderText([
    `Boas-vindas, ${greeting}!`,
    '',
    `Sua conta no ${BRAND_NAME} está confirmada. Para começar a vender:`,
    ...STEPS.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Bons negócios!',
  ]);

  return { subject, html, text };
}
