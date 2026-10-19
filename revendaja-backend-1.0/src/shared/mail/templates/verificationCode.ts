import {
  BRAND_NAME,
  codeBox,
  firstName,
  heading,
  mutedParagraph,
  paragraph,
  renderLayout,
  renderText,
  escapeHtml,
  type RenderedEmail,
} from './layout';

interface VerificationCodeEmailData {
  name: string;
  code: string;
  expiresInMinutes: number;
  // true no reenvio: muda o assunto/texto e avisa que o código anterior caiu.
  isResend?: boolean;
}

// Enviado no cadastro e também no reenvio do código de verificação.
export function verificationCodeEmail({
  name,
  code,
  expiresInMinutes,
  isResend = false,
}: VerificationCodeEmailData): RenderedEmail {
  const greeting = firstName(name);
  const subject = isResend
    ? `Seu novo código de verificação do ${BRAND_NAME}`
    : `Seu código de verificação do ${BRAND_NAME}`;
  const intro = isResend
    ? 'Você pediu um novo código. Os códigos enviados antes deixam de valer. Use este para confirmar seu e-mail:'
    : 'Use o código abaixo para confirmar seu e-mail e ativar sua conta:';
  const expiration = `O código expira em ${expiresInMinutes} minutos.`;
  const ignoreNotice = 'Se você não fez esta solicitação, pode ignorar este e-mail.';

  const html = renderLayout({
    title: subject,
    preheader: `Seu código é ${code}. Ele expira em ${expiresInMinutes} minutos.`,
    bodyHtml: [
      heading(`Olá, ${greeting}!`),
      paragraph(escapeHtml(intro)),
      codeBox(code),
      paragraph(escapeHtml(expiration)),
      mutedParagraph(escapeHtml(ignoreNotice)),
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
    ignoreNotice,
  ]);

  return { subject, html, text };
}
