import { mailProvider, type MailProvider } from './mailProvider';
import type { RenderedEmail } from './templates/layout';
import { passwordChangedEmail } from './templates/passwordChanged';
import { passwordResetEmail } from './templates/passwordReset';
import { verificationCodeEmail } from './templates/verificationCode';
import { welcomeEmail } from './templates/welcome';

export interface MailRecipient {
  name: string;
  email: string;
}

// Ponto único de envio de e-mails transacionais: cada método monta o template
// certo e entrega pelo `MailProvider`. Quem chama (auth, otp, ...) só diz
// *qual* e-mail quer mandar — não conhece HTML nem a Resend.
export class MailService {
  constructor(private readonly provider: MailProvider = mailProvider) {}

  sendWelcome(to: MailRecipient): Promise<void> {
    return this.deliver(to, welcomeEmail({ name: to.name }));
  }

  sendVerificationCode(
    to: MailRecipient,
    code: string,
    options: { expiresInMinutes: number; isResend?: boolean },
  ): Promise<void> {
    return this.deliver(
      to,
      verificationCodeEmail({
        name: to.name,
        code,
        expiresInMinutes: options.expiresInMinutes,
        isResend: options.isResend,
      }),
    );
  }

  sendPasswordReset(
    to: MailRecipient,
    code: string,
    options: { expiresInMinutes: number },
  ): Promise<void> {
    return this.deliver(
      to,
      passwordResetEmail({ name: to.name, code, expiresInMinutes: options.expiresInMinutes }),
    );
  }

  sendPasswordChanged(to: MailRecipient): Promise<void> {
    return this.deliver(to, passwordChangedEmail({ name: to.name }));
  }

  private deliver(to: MailRecipient, content: RenderedEmail): Promise<void> {
    return this.provider.send({ to: to.email, ...content });
  }
}

export const mailService = new MailService();
