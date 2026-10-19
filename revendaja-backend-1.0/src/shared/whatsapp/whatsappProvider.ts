import { logger } from '../logger';

export interface WhatsAppProvider {
  sendOtp(whatsapp: string, code: string): Promise<void>;
}

// Implementação padrão: apenas loga o código em vez de enviar de verdade.
// Troque `whatsappProvider` abaixo por uma implementação real (Meta
// WhatsApp Cloud API, Twilio, Zenvia, etc.) antes de ir para produção —
// o resto da aplicação depende só da interface `WhatsAppProvider`.
export const consoleWhatsAppProvider: WhatsAppProvider = {
  async sendOtp(whatsapp, code) {
    logger.info(`[WHATSAPP MOCK] Código ${code} para ${whatsapp}`);
  },
};

export const whatsappProvider: WhatsAppProvider = consoleWhatsAppProvider;
