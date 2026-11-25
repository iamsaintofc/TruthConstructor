// Читает .env и генерирует js/config.js для статического фронта.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

if (!existsSync(envPath)) {
  console.error('Файл .env не найден. Скопируйте .env.example в .env и заполните.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
  if (!env[k]) { console.error(`Не задана переменная ${k} в .env`); process.exit(1); }
}

const out = `// АВТОГЕНЕРИРОВАНО из .env — не редактировать вручную.
window.SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(env.SUPABASE_ANON_KEY)};
`;
writeFileSync(join(root, 'js', 'config.js'), out);
console.log('js/config.js сгенерирован.');
