// Деплой dist/ на хостинг Plesk по FTPS. Запуск из корня проекта: node deploy/deploy-ftp.mjs
// Настройки — в deploy/ftp.env (не в git): FTP_HOST, FTP_USER, FTP_PASS, FTP_REMOTE_DIR (необязательно), SITE_URL (необязательно)
// Что делает: собранный dist/ загружается поверх; в _astro/ удаляются файлы, которых нет в новой сборке;
// api/config.php и api/.leads/ на сервере не трогаются никогда. В конце — HTTP-проверка страниц и свежего ассета.
import { Client } from 'basic-ftp';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, 'deploy', 'ftp.env');
const DIST = path.join(ROOT, 'dist');

if (!existsSync(ENV_FILE)) {
  console.error('deploy/ftp.env не найден. Создайте файл по образцу deploy/ftp.env.example (FTP_HOST, FTP_USER, FTP_PASS).');
  process.exit(2);
}
const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
for (const k of ['FTP_HOST', 'FTP_USER', 'FTP_PASS']) if (!env[k]) { console.error(`В deploy/ftp.env нет ${k}`); process.exit(2); }
if (!existsSync(path.join(DIST, 'index.html'))) { console.error('dist/index.html нет — сначала npm run build'); process.exit(2); }
const SITE = (env.SITE_URL || 'https://cybermove.asia').replace(/\/$/, '');

const client = new Client(60_000);
client.ftp.verbose = false;
async function connect() {
  const base = { host: env.FTP_HOST, user: env.FTP_USER, password: env.FTP_PASS, port: Number(env.FTP_PORT || 21) };
  try {
    await client.access({ ...base, secure: true, secureOptions: { rejectUnauthorized: false } });
    console.log('FTPS: соединение защищено (explicit TLS)');
  } catch (e) {
    console.warn('FTPS не удался (' + String(e.message).slice(0, 80) + '), пробую обычный FTP — пароль пойдёт открытым текстом, лучше включить FTPS в Plesk');
    client.close();
    await client.access({ ...base, secure: false });
  }
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  await connect();
  let remote = env.FTP_REMOTE_DIR;
  if (!remote) {
    const rootList = await client.list('/');
    remote = rootList.some((f) => f.name === 'httpdocs') ? '/httpdocs' : '/';
  }
  console.log('Папка на сервере:', remote);
  await client.ensureDir(remote);
  await client.cd(remote);

  // 1. загрузка поверх (basic-ftp создаёт папки сама). api/config.php в dist нет — он живёт только на сервере.
  const local = walk(DIST);
  if (local.includes('api/config.php')) { console.error('В dist/ оказался api/config.php — он не должен попадать в сборку. Стоп.'); process.exit(3); }
  console.log(`Загрузка ${local.length} файлов…`);
  await client.uploadFromDir(DIST, remote);

  // 2. чистка _astro: удалить хэшированные файлы прошлых сборок
  const localAstro = new Set(local.filter((f) => f.startsWith('_astro/')).map((f) => f.slice('_astro/'.length)));
  await client.cd(remote + '/_astro');
  const remoteAstro = await client.list();
  let removed = 0;
  for (const f of remoteAstro) {
    if (f.isFile && !localAstro.has(f.name)) { await client.remove(f.name); removed++; }
  }
  console.log(`_astro: удалено устаревших файлов — ${removed}`);
  client.close();

  // 3. проверка по HTTP: страницы и свежий ассет
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const asset = (html.match(/\/_astro\/[^"']+\.js/) || [])[0];
  const checks = ['/', '/en/', '/cases/', '/contact/', asset].filter(Boolean);
  let ok = true;
  for (const p of checks) {
    for (const scheme of [SITE, SITE.replace('https://', 'http://')]) {
      try {
        const r = await fetch(scheme + p, { redirect: 'follow' });
        console.log(`${r.status}  ${scheme}${p}`);
        if (r.status !== 200) ok = false;
        break;
      } catch (e) {
        if (scheme.startsWith('http://')) { console.log(`ERR  ${p}: ${String(e.message).slice(0, 80)}`); ok = false; }
      }
    }
  }
  console.log(ok ? 'Деплой завершён, сайт отвечает.' : 'Деплой загружен, но проверка по HTTP не прошла полностью — проверьте DNS и SSL в Plesk.');
}
main().catch((e) => { console.error('Ошибка деплоя:', e.message); client.close(); process.exit(1); });
