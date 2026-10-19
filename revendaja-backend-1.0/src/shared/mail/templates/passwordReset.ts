import {
  BRAND_NAME,
  codeBox,
  escapeHtml,
  firstName,
  heading,
  mutedParagraph,
  paragraph,
  renderLayout,
  renderText,
  type RenderedEmail,
} from './layout';

interface PasswordResetEmailData {
  name: string;
  code: string;
  expiresInMinutes: number;
}

// Enviado quando a usuária diz que esqueceu a senha. É um código (e não um
// link) porque o cliente é um app: ela digita o código na própria tela de
// redefinição.
export function passwordResetEmail({
  name,
  code,
  expiresInMinutes,
}: PasswordResetEmailData): RenderedEmail {
  const greeting = firstName(name);
  const subject = `Código para redefinir sua senha do ${BRAND_NAME}`;
  const intro =
    'Recebemos um pedido para redefinir a senha da sua conta. Digite o código abaixo no app para criar uma nova senha:';
  const expiration = `O código expira em ${expiresInMinutes} minutos e só pode ser usado uma vez.`;
  const warning =
    'Não compartilhe este código com ninguém. Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.';

  const html = renderLayout({
    title: subject,
    preheader: `Seu código é ${code}. Ele expira em ${expiresInMinutes} minutos.`,
    bodyHtml: [
      heading(`Olá, ${greeting}!`),
      paragraph(escapeHtml(intro)),
      codeBox(code),
      paragraph(escapeHtml(expiration)),
      mutedParagraph(escapeHtml(warning)),
    ].join(''),
  });

  const text = renderText([
    `Olá, ${greeting}!`,
    '',
    intro,
    '',
    `    ${code}`,
    '',
    expiration,
    warning,
  ]);

  return { subject, html, text };
}
