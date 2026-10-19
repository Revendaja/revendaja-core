export const BRAND_NAME = 'Revendaja';

const ACCENT_COLOR = '#7c3aed';
const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Resultado de qualquer template: assunto + as duas versões do corpo.
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Todo dado vindo da usuária (nome, etc.) precisa passar por aqui antes de
// entrar no HTML — senão um nome como `<script>` viraria markup no e-mail.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:22px;line-height:1.3;color:#1f1f2e;">${escapeHtml(text)}</h1>`;
}

// `html` já deve vir escapado/montado por quem chama (permite <strong>, links).
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#3d3d4e;">${html}</p>`;
}

export function mutedParagraph(html: string): string {
  return `<p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:#8a8a99;">${html}</p>`;
}

export function orderedList(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#3d3d4e;">${item}</li>`,
    )
    .join('');
  return `<ol style="margin:0 0 16px;padding-left:20px;">${rows}</ol>`;
}

export function codeBox(code: string): string {
  return `<div style="margin:0 0 20px;padding:18px 12px;background-color:#f4f0ff;border-radius:10px;text-align:center;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${ACCENT_COLOR};">${escapeHtml(code)}</div>`;
}

export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background-color:${ACCENT_COLOR};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

interface LayoutOptions {
  title: string;
  // Texto que aparece na prévia da caixa de entrada, ao lado do assunto.
  preheader: string;
  bodyHtml: string;
}

// Layout com tabelas e estilos inline de propósito: é o que Gmail, Outlook e
// afins renderizam de forma consistente (eles ignoram/removem <style> e CSS
// moderno).
export function renderLayout({ title, preheader, bodyHtml }: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 4px 16px;font-family:${FONT_STACK};font-size:20px;font-weight:700;color:${ACCENT_COLOR};">${BRAND_NAME}</td>
            </tr>
            <tr>
              <td style="padding:32px;background-color:#ffffff;border-radius:12px;">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:#8a8a99;">Este é um e-mail automático do ${BRAND_NAME}.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderText(lines: string[]): string {
  return `${lines.join('\n')}\n\n— Equipe ${BRAND_NAME}`;
}
