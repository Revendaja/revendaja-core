import { escapeHtml, firstName } from '../templates/layout';
import { passwordChangedEmail } from '../templates/passwordChanged';
import { passwordResetEmail } from '../templates/passwordReset';
import { verificationCodeEmail } from '../templates/verificationCode';
import { welcomeEmail } from '../templates/welcome';

describe('layout helpers', () => {
  it('escapeHtml neutraliza caracteres especiais de HTML', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });

  it('firstName devolve só o primeiro nome', () => {
    expect(firstName('  Ana   Souza Lima ')).toBe('Ana');
  });
});

describe('welcomeEmail', () => {
  it('cumprimenta pelo primeiro nome e traz HTML e texto', () => {
    const email = welcomeEmail({ name: 'Ana Souza' });

    expect(email.subject).toBe('Boas-vindas ao Revendaja, Ana!');
    expect(email.html).toContain('<!DOCTYPE html>');
    expect(email.html).toContain('Boas-vindas, Ana!');
    expect(email.text).toContain('Boas-vindas, Ana!');
    expect(email.text).not.toContain('<');
  });

  it('escapa o nome para que não vire markup no e-mail', () => {
    const email = welcomeEmail({ name: '<img src=x onerror=alert(1)>' });

    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img');
  });
});

describe('verificationCodeEmail', () => {
  it('inclui o código e a validade no HTML e no texto', () => {
    const email = verificationCodeEmail({ name: 'Ana', code: '048213', expiresInMinutes: 10 });

    expect(email.subject).toBe('Seu código de verificação do Revendaja');
    expect(email.html).toContain('048213');
    expect(email.html).toContain('10 minutos');
    expect(email.text).toContain('048213');
    expect(email.text).toContain('10 minutos');
  });

  it('usa assunto e texto próprios no reenvio e avisa que os códigos anteriores caducaram', () => {
    const email = verificationCodeEmail({
      name: 'Ana',
      code: '999111',
      expiresInMinutes: 10,
      isResend: true,
    });

    expect(email.subject).toBe('Seu novo código de verificação do Revendaja');
    expect(email.text).toContain('novo código');
    expect(email.text).toContain('deixam de valer');
    expect(email.text).toContain('999111');
  });
});

describe('passwordResetEmail', () => {
  it('mostra o código de 6 dígitos e a validade no HTML e no texto', () => {
    const email = passwordResetEmail({ name: 'Ana Souza', code: '048213', expiresInMinutes: 15 });

    expect(email.subject).toBe('Código para redefinir sua senha do Revendaja');
    expect(email.html).toContain('048213');
    expect(email.html).toContain('15 minutos');
    expect(email.text).toContain('048213');
    expect(email.text).toContain('15 minutos');
  });

  it('não usa link (o cliente é um app) e avisa para não compartilhar o código', () => {
    const email = passwordResetEmail({ name: 'Ana Souza', code: '048213', expiresInMinutes: 15 });

    expect(email.html).not.toContain('href=');
    expect(email.text).not.toContain('http');
    expect(email.text).toContain('Não compartilhe');
  });
});

describe('passwordChangedEmail', () => {
  it('avisa da alteração e orienta em caso de suspeita', () => {
    const email = passwordChangedEmail({ name: 'Ana Souza' });

    expect(email.subject).toBe('Sua senha do Revendaja foi alterada');
    expect(email.html).toContain('foi alterada');
    expect(email.text).toContain('Se não foi você');
  });
});
