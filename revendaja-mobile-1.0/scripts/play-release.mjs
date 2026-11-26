// Gera o "Nome do lançamento" e as "Notas de lançamento" do Play Console.
//
// Uso:  npm run release:notes            (usa a versão do app.json)
//       npm run release:notes -- 1.0.1   (versão específica)
//       npm run release:notes -- --force (gera de novo, sobrescrevendo o arquivo)
//
// Se release-notes/<versão>.txt não existir, o script GERA o arquivo a partir dos commits
// feat/fix/perf feitos desde a versão anterior (tag v<anterior> ou o commit que criou as notas
// dela). Com ANTHROPIC_API_KEY definida, o Claude reescreve os commits como notas em português
// para o usuário final; sem a chave, grava um rascunho com os commits para você editar.
// Sempre revise o texto gerado antes de colar no Play Console.
//
// As notas ficam em release-notes/<versão>.txt (texto simples, em português, escrito para quem
// usa o app). O script valida o limite do Play (500 caracteres), embrulha na etiqueta de idioma
// e copia as notas para a área de transferência. O nome do lançamento é só um rótulo interno.
//
// Idioma: precisa ser o mesmo idioma cadastrado no Play Console (hoje pt-PT). Se mudar o
// idioma predefinido para pt-BR, rode com PLAY_LANG=pt-BR.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX = 500;
const lang = process.env.PLAY_LANG || 'pt-PT';

const args = process.argv.slice(2);
const force = args.includes('--force');
const appVersion = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
const version = args.find((a) => !a.startsWith('--')) || appVersion;
const dir = join(root, 'release-notes');
const file = join(dir, `${version}.txt`);

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const cmpVersion = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

// Ponto de partida: tag v<anterior> ou o commit que criou as notas da versão anterior.
function baseCommit() {
  const prev = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => /^\d+\.\d+\.\d+\.txt$/.test(f))
    .map((f) => f.replace('.txt', ''))
    .filter((v) => cmpVersion(v, version) < 0)
    .sort(cmpVersion)
    .pop();
  if (!prev) return { prev: null, base: '' };
  const tag = git(`rev-parse --verify --quiet v${prev}^{commit}`);
  if (tag) return { prev, base: tag };
  return { prev, base: git(`log -1 --format=%H --diff-filter=A -- release-notes/${prev}.txt`) };
}

function commitsSince(base) {
  const out = git(`log ${base ? `${base}..HEAD` : 'HEAD'} --no-merges --format=%s`);
  return out
    .split('\n')
    .filter((l) => /^(feat|fix|perf)(\(.+?\))?!?:/.test(l))
    .map((l) => l.replace(/\s*>>.*$/, '').slice(0, 200));
}

const draftFrom = (commits) =>
  commits.map((c) => `• ${c.replace(/^\w+(\(.+?\))?!?:\s*/, '')}`).join('\n') + '\n';

async function generateWithClaude(commits) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.RELEASE_NOTES_MODEL || 'claude-haiku-5-5',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content:
            'Escreva as notas de atualização do app RevendaJá (app para revendedores gerirem produtos, vendas e loja online) na Play Store.\n' +
            'Regras: português do Brasil, texto simples, uma linha de abertura curta e depois bullets começando com "• ", ' +
            'foco no que o usuário final percebe, sem jargão técnico, sem mencionar commits/API/backend, ' +
            `ignore mudanças internas sem efeito visível, máximo ${MAX} caracteres no total. Responda só com o texto.\n\n` +
            `Commits desde a última versão:\n${commits.map((c) => `- ${c}`).join('\n')}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.map((b) => b.text || '').join('').trim();
}

if (!existsSync(file) || force) {
  const { prev, base } = baseCommit();
  const commits = commitsSince(base);
  if (!commits.length) {
    console.error(
      `Nenhum commit feat/fix/perf desde ${prev ? `a versão ${prev}` : 'o início'}. Crie release-notes/${version}.txt à mão.`,
    );
    process.exit(1);
  }
  console.log(`Gerando notas da ${version} a partir de ${commits.length} commit(s) desde ${prev ?? 'o início'}...`);
  mkdirSync(dir, { recursive: true });

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      writeFileSync(file, (await generateWithClaude(commits)) + '\n');
      console.log(`✔ Gerado com Claude em release-notes/${version}.txt (revise antes de publicar)`);
    } catch (e) {
      writeFileSync(file, draftFrom(commits));
      console.error(`Falha ao chamar o Claude (${e.message}).`);
      console.error(`Rascunho com os commits gravado em release-notes/${version}.txt: edite e rode de novo.`);
      process.exit(1);
    }
  } else {
    writeFileSync(file, draftFrom(commits));
    console.log(`Rascunho gravado em release-notes/${version}.txt (commits em inglês).`);
    console.log('Edite para português voltado ao usuário e rode de novo.');
    console.log('Dica: defina ANTHROPIC_API_KEY para o Claude gerar o texto já pronto.');
    process.exit(0);
  }
}

const notes = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
if (notes.length > MAX) {
  console.error(`Notas com ${notes.length} caracteres: o Play aceita no máximo ${MAX}. Encurte o arquivo.`);
  process.exit(1);
}
if (version !== appVersion) {
  console.warn(`Aviso: a versão pedida (${version}) difere da do app.json (${appVersion}).`);
}

const name = version;
const block = `<${lang}>\n${notes}\n</${lang}>`;

console.log(`\nNome do lançamento:\n${name}\n\nNotas de lançamento (${notes.length}/${MAX}):\n${block}\n`);

try {
  execSync(process.platform === 'win32' ? 'clip' : process.platform === 'darwin' ? 'pbcopy' : 'xclip -selection clipboard', {
    input: block,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  console.log('✔ Notas copiadas para a área de transferência (cole no campo de notas).');
} catch {
  console.log('Não consegui copiar sozinho: copie o bloco acima.');
}
