import {
  BRAND_NAME,
  escapeHtml,
  firstName,
  heading,
  mutedParagraph,
  paragraph,
  renderLayout,
  renderText,
  type RenderedEmail,
} from './layout';

interface PasswordChangedEmailData {
  name: string;
}

// Confirmação enviada depois que a senha é alterada (por redefinição ou não).
export function passwordChangedEmail({ name }: PasswordChangedEmailData): RenderedEmail {
  const greeting = firstName(name);
  const subject = `Sua senha do ${BRAND_NAME} foi alterada`;
  const message = 'A senha da sua conta acabou de ser alterada.';
  const warning =
    'Se não foi você, redefina sua senha imediatamente pela opção "Esqueci minha senha" e entre em contato com o nosso suporte.';

  const html = renderLayout({
    title: subject,
    preheader: 'A senha da sua conta foi alterada.',
    bodyHtml: [
      heading(`Olá, ${greeting}!`),
      paragraph(escapeHtml(message)),
      mutedParagraph(escapeHtml(warning)),
    ].join(''),
  });

  const text = renderText([`Olá, ${greeting}!`, '', message, warning]);

  return { subject, html, text };
}
