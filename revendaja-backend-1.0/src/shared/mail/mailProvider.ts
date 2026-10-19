import { Resend } from 'resend';
import { env } from '../../config/env';
import { logger } from '../logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  // Versão em texto puro: melhora a entregabilidade (filtros de spam) e é o
  // que clientes sem suporte a HTML exibem.
  text: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

// Usado quando não há RESEND_API_KEY (dev/test): apenas loga o e-mail em vez
// de enviar — o código do OTP aparece no console do servidor.
export const consoleMailProvider: MailProvider = {
  async send({ to, subject, text }) {
    logger.info(`[MAIL MOCK] Para: ${to} | Assunto: ${subject}\n${text}`);
  },
};

export function createResendMailProvider(apiKey: string, from: string): MailProvider {
  const client = new Resend(apiKey);

  return {
    async send({ to, subject, html, text }) {
      // O SDK da Resend não lança em erro de API: devolve `{ data, error }`.
      const { error } = await client.emails.send({ from, to, subject, html, text });
      if (error) {
        throw new Error(`Falha ao enviar e-mail via Resend (${error.name}): ${error.message}`);
      }
    },
  };
}

export const mailProvider: MailProvider = env.RESEND_API_KEY
  ? createResendMailProvider(env.RESEND_API_KEY, env.MAIL_FROM)
  : consoleMailProvider;
