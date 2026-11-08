import type { Metadata } from 'next';
import Link from 'next/link';
import { Section, List } from '@/components/legal/blocks';
import { CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade | RevendaJá',
  description:
    'Como o RevendaJá coleta, usa, compartilha e protege os dados de quem usa o aplicativo e a vitrine online.',
};

const LAST_UPDATE = '8 de novembro de 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm font-semibold text-primary-600 hover:text-primary-700">
        ← Voltar para o RevendaJá
      </Link>

      <h1 className="mt-6 text-3xl font-extrabold text-ink-900 sm:text-4xl">
        Política de Privacidade
      </h1>
      <p className="mt-2 text-sm text-ink-500">Última atualização: {LAST_UPDATE}</p>

      <p className="mt-6 leading-7 text-ink-700">
        O RevendaJá é um aplicativo e um site para revendedoras e pequenos lojistas organizarem
        produtos, estoque e vendas e terem uma vitrine online. Esta política explica, de forma
        simples, quais dados tratamos, por que, com quem compartilhamos e quais são os seus
        direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <Section title="1. Quem é o responsável pelos dados">
        <p>
          O RevendaJá é o controlador dos dados da sua conta (seção 2.1). Em relação aos dados dos
          clientes da sua loja (seções 2.3 e 2.4), quem decide como usá-los é você, lojista; nós
          atuamos como operador, guardando e processando essas informações apenas para o
          funcionamento do serviço.
        </p>
        <p>
          Contato para assuntos de privacidade:{' '}
          <a className="font-semibold text-primary-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Dados que coletamos">
        <h3 className="font-semibold text-ink-900">2.1 Dados da conta</h3>
        <List
          items={[
            'Nome, e-mail e número de WhatsApp.',
            'Senha, guardada apenas de forma criptografada (hash), nunca em texto legível.',
            'Se você entrar com o Google: o identificador da conta Google, seu nome e e-mail. Não temos acesso à sua senha do Google.',
            'Códigos de verificação e de recuperação de senha, que expiram em poucos minutos e são guardados de forma criptografada.',
          ]}
        />

        <h3 className="font-semibold text-ink-900">2.2 Dados da sua loja</h3>
        <List
          items={[
            'Nome, endereço de link (handle), descrição, logo e personalização da vitrine.',
            'Produtos, preços, custos, estoque, categorias, promoções e fotos que você cadastra.',
            'Meta de vendas, plano contratado e preferências da loja.',
          ]}
        />

        <h3 className="font-semibold text-ink-900">2.3 Vendas registradas por você</h3>
        <List
          items={[
            'Itens, valores, forma de pagamento e data de cada venda.',
            'Nome do cliente e, se você informar, WhatsApp e endereço de entrega.',
          ]}
        />

        <h3 className="font-semibold text-ink-900">2.4 Pedidos feitos na vitrine online</h3>
        <p>
          Quando alguém faz um pedido na vitrine de uma loja, coletamos o nome, o WhatsApp, a forma
          de recebimento (retirada ou entrega), o endereço de entrega e os itens do pedido. Essas
          informações são enviadas para a loja, que as usa para combinar pagamento e entrega. A
          vitrine também registra visitas de forma anônima (apenas o momento do acesso, sem dados do
          visitante) para mostrar à loja quantas pessoas a visitaram.
        </p>

        <h3 className="font-semibold text-ink-900">2.5 Assistente de IA</h3>
        <p>
          Se você usa o assistente, guardamos o histórico da conversa (suas mensagens e as
          respostas) e as ações que ele propõe e que você confirma. Ao falar por voz, o áudio é
          enviado para ser transcrito em texto. Para responder, o assistente consulta dados da sua
          própria loja, como produtos, estoque e vendas.
        </p>

        <h3 className="font-semibold text-ink-900">2.6 Dados do aparelho e notificações</h3>
        <List
          items={[
            'Identificador de notificações push do seu aparelho, para enviar avisos como estoque baixo, meta de vendas e novos pedidos.',
            'Registros técnicos de funcionamento e segurança (por exemplo, erros e tentativas de acesso).',
          ]}
        />

        <h3 className="font-semibold text-ink-900">2.7 Pagamento da assinatura</h3>
        <p>
          Os planos pagos são cobrados pela Stripe. Os dados do cartão são digitados no ambiente da
          Stripe e não passam pelos nossos servidores nem ficam guardados por nós. Recebemos da
          Stripe apenas informações como o status e o período da assinatura.
        </p>
      </Section>

      <Section title="3. Permissões do aplicativo">
        <List
          items={[
            <>
              <strong>Câmera:</strong> escanear o código de barras de produtos e fotografar
              produtos.
            </>,
            <>
              <strong>Fotos e arquivos:</strong> escolher a imagem de um produto ou da loja.
            </>,
            <>
              <strong>Microfone:</strong> conversar por voz com o assistente. O microfone só grava
              enquanto você usa essa função.
            </>,
            <>
              <strong>Notificações:</strong> receber os avisos da sua loja.
            </>,
          ]}
        />
        <p>
          Você pode negar ou revogar qualquer permissão nas configurações do aparelho. As funções
          que dependem dela deixam de funcionar, mas o restante do app continua disponível.
        </p>
      </Section>

      <Section title="4. Para que usamos os dados">
        <List
          items={[
            'Criar e manter sua conta, autenticar seu acesso e proteger contra uso indevido.',
            'Prestar o serviço: gerenciar produtos, estoque, vendas, relatórios e a vitrine online.',
            'Enviar códigos de verificação, recuperação de senha e notificações do app.',
            'Processar a cobrança dos planos pagos.',
            'Responder às suas mensagens ao suporte e cumprir obrigações legais.',
            'Melhorar a estabilidade e a segurança do serviço.',
          ]}
        />
        <p>
          As bases legais são a execução do contrato de uso do serviço, o cumprimento de obrigações
          legais, o legítimo interesse (segurança e prevenção a fraudes) e, quando necessário, o seu
          consentimento. Não vendemos seus dados e não os usamos para publicidade de terceiros.
        </p>
      </Section>

      <Section title="5. Com quem compartilhamos">
        <p>
          Compartilhamos dados apenas com empresas que nos ajudam a operar o serviço, e só o
          necessário para cada função:
        </p>
        <List
          items={[
            <>
              <strong>Stripe:</strong> cobrança de assinaturas.
            </>,
            <>
              <strong>OpenAI:</strong> processar as mensagens e o áudio do assistente de IA. O
              histórico da conversa é guardado por nós; pedimos ao provedor que não armazene as
              conversas.
            </>,
            <>
              <strong>Google:</strong> login com o Google e entrega de notificações em aparelhos
              Android.
            </>,
            <>
              <strong>Expo:</strong> envio de notificações push.
            </>,
            <>
              <strong>Resend:</strong> envio de e-mails (códigos de verificação e recuperação de
              senha).
            </>,
            <>
              <strong>Amazon Web Services (S3):</strong> armazenamento das imagens que você envia.
            </>,
            <>
              <strong>Provedores de hospedagem e banco de dados</strong> (Fly.io e Neon), onde o
              serviço e os dados ficam armazenados.
            </>,
          ]}
        />
        <p>
          Também podemos divulgar dados se houver determinação legal ou ordem de autoridade
          competente. Os pedidos feitos na vitrine são enviados à loja responsável pelo pedido.
        </p>
      </Section>

      <Section title="6. Transferência internacional">
        <p>
          Alguns desses provedores ficam fora do Brasil. Nesses casos, o tratamento ocorre com as
          garantias previstas na LGPD, incluindo cláusulas contratuais e as políticas de proteção
          de dados desses fornecedores.
        </p>
      </Section>

      <Section title="7. Por quanto tempo guardamos">
        <List
          items={[
            'Os dados da conta e da loja ficam guardados enquanto a conta estiver ativa.',
            'Os registros de visitas à vitrine são apagados automaticamente após cerca de 30 dias.',
            'Códigos de verificação e recuperação de senha expiram em minutos e são invalidados após o uso.',
            'Após a exclusão da conta, apagamos ou anonimizamos os dados, exceto o que precisarmos manter para cumprir obrigações legais ou exercer direitos em processos.',
          ]}
        />
      </Section>

      <Section title="8. Como protegemos seus dados">
        <List
          items={[
            'Comunicação protegida por HTTPS.',
            'Senhas armazenadas apenas com criptografia (hash).',
            'Cada conta mantém uma única sessão ativa; um novo login encerra o acesso do aparelho anterior.',
            'Limite de tentativas nos códigos de verificação e de recuperação de senha.',
            'Acesso interno restrito ao necessário.',
          ]}
        />
        <p>
          Nenhum sistema é totalmente imune a falhas. Se ocorrer um incidente de segurança que possa
          trazer risco relevante a você, avisaremos você e a autoridade competente, conforme a lei.
        </p>
      </Section>

      <Section title="9. Seus direitos">
        <p>Pela LGPD, você pode solicitar, a qualquer momento:</p>
        <List
          items={[
            'Confirmação de que tratamos seus dados e acesso a eles.',
            'Correção de dados incompletos, inexatos ou desatualizados.',
            'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei.',
            'Portabilidade dos seus dados.',
            'Informação sobre com quem compartilhamos seus dados.',
            'Revogação do consentimento e exclusão dos dados tratados com base nele.',
          ]}
        />
        <p>
          Parte dos dados você mesma(o) altera no app, em Conta e Loja. Você também pode{' '}
          <strong>excluir a conta e todos os dados</strong> direto no aplicativo, em{' '}
          <em>Mais → Meus Dados → Excluir minha conta</em>, ou seguir os passos em{' '}
          <Link className="font-semibold text-primary-600 underline" href="/excluir-conta">
            revendaja.com/excluir-conta
          </Link>
          . Para os demais pedidos, escreva para{' '}
          <a className="font-semibold text-primary-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          usando o e-mail cadastrado na conta. Podemos pedir uma confirmação de identidade para
          proteger você. Responderemos em até 15 dias.
        </p>
        <p>
          Se você é cliente de uma loja e quer corrigir ou apagar os dados de um pedido, fale
          primeiro com a loja. Se preferir, escreva para nós e encaminhamos o pedido.
        </p>
      </Section>

      <Section title="10. Crianças e adolescentes">
        <p>
          O RevendaJá é voltado a pessoas maiores de 18 anos e não coleta de propósito dados de
          crianças. Se você acredita que um menor nos enviou dados, entre em contato para
          removermos.
        </p>
      </Section>

      <Section title="11. Alterações desta política">
        <p>
          Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A data no
          topo da página mostra a última revisão. Quando a mudança for relevante, avisaremos pelo
          aplicativo ou por e-mail.
        </p>
      </Section>

      <Section title="12. Fale com a gente">
        <p>
          Dúvidas sobre esta política ou sobre seus dados:{' '}
          <a className="font-semibold text-primary-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
