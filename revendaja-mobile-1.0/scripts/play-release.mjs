// Gera o "Nome do lançamento" e as "Notas de lançamento" do Play Console.
//
// Uso:  npm run release:notes            (usa a versão do app.json)
//       npm run release:notes -- 1.0.1   (versão específica)
//
// As notas ficam em release-notes/<versão>.txt (texto simples, em português, escrito para quem
// usa o app). O script valida o limite do Play (500 caracteres), embrulha na etiqueta de idioma
// e copia as notas para a área de transferência. O nome do lançamento é só um rótulo interno.
//
// Idioma: precisa ser o mesmo idioma cadastrado no Play Console (hoje pt-PT). Se mudar o
// idioma predefinido para pt-BR, rode com PLAY_LANG=pt-BR.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX = 500;
const lang = process.env.PLAY_LANG || 'pt-PT';

const appVersion = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
const version = process.argv[2] || appVersion;
const file = join(root, 'release-notes', `${version}.txt`);

if (!existsSync(file)) {
  const have = existsSync(join(root, 'release-notes')) ? readdirSync(join(root, 'release-notes')) : [];
  console.error(`Faltam as notas da versão ${version}: crie release-notes/${version}.txt`);
  if (have.length) console.error(`Existentes: ${have.join(', ')}`);
  process.exit(1);
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
