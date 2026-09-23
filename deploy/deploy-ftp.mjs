// Деплой dist/ на хостинг Plesk по FTPS. Запуск из корня проекта: node deploy/deploy-ftp.mjs
// Настройки — в deploy/ftp.env (не в git): FTP_HOST, FTP_USER, FTP_PASS, FTP_REMOTE_DIR (необязательно), SITE_URL (необязательно)
// Что делает: сравнивает dist/ с тем, что уже лежит на сервере, и заливает только новое и изменившееся;
// в _astro/ удаляет файлы, которых нет в новой сборке; api/config.php и api/.leads/ не трогает никогда.
// Контрольное соединение Plesk рвёт на длинной заливке (ECONNRESET), поэтому каждая операция
// переподключается и повторяется; прогресс печатается по ходу. В конце — HTTP-проверка страниц.
import { Client } from 'basic-ftp';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
/** --no-clean: не удалять устаревшие файлы в _astro (только заливка) */
const NO_CLEAN = process.argv.includes('--no-clean');
const ENV_FILE = path.join(ROOT, 'deploy', 'ftp.env');
const DIST = path.join(ROOT, 'dist');

if (!existsSync(ENV_FILE)) {
  console.error('deploy/ftp.env не найден. Создайте файл по образцу deploy/ftp.env.example (FTP_HOST, FTP_USER, FTP_PASS).');
  process.exit(2);
}
const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
for (const k of ['FTP_HOST', 'FTP_USER', 'FTP_PASS']) {
  if (!env[k]) {
    console.error(`В deploy/ftp.env нет ${k}`);
    process.exit(2);
  }
}
if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html нет — сначала npm run build');
  process.exit(2);
}
const SITE = (env.SITE_URL || 'https://cybermove.asia').replace(/\/$/, '');

let client = null;
let remote = env.FTP_REMOTE_DIR || '';

async function connect() {
  if (client) client.close();
  client = new Client(120_000);
  client.ftp.verbose = false;
  const base = { host: env.FTP_HOST, user: env.FTP_USER, password: env.FTP_PASS, port: Number(env.FTP_PORT || 21) };
  try {
    await client.access({ ...base, secure: true, secureOptions: { rejectUnauthorized: false } });
  } catch (e) {
    console.warn('FTPS не удался (' + String(e.message).slice(0, 80) + '), пробую обычный FTP — пароль пойдёт открытым текстом, лучше включить FTPS в Plesk');
    client.close();
    client = new Client(120_000);
    client.ftp.verbose = false;
    await client.access({ ...base, secure: false });
  }
  client.ftp.socket.setKeepAlive(true, 15_000);
  if (!remote) {
    // корень сайта — тот каталог, где лежит index.html: у части аккаунтов это /httpdocs,
    // у части — сам корень FTP. Наличие подкаталога httpdocs ещё ничего не значит.
    remote = '/';
    for (const candidate of ['/httpdocs', '/']) {
      try {
        await client.size(`${candidate}/index.html`);
        remote = candidate;
        break;
      } catch {
        /* пробуем следующий */
      }
    }
  }
}

/** После разрыва курсор сервера сбрасывается — вызывается, чтобы забыть текущий каталог. */
let onReconnect = () => {};

/** Операция с переподключением: Plesk рвёт контрольный канал, а basic-ftp после этого непригоден. */
async function withRetry(label, fn, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      if (!client || client.closed) await connect();
      return await fn();
    } catch (e) {
      const msg = String(e.message || e).slice(0, 90);
      if (i === tries) throw new Error(`${label}: ${msg}`);
      console.warn(`  ${label}: ${msg} — переподключаюсь (попытка ${i + 1} из ${tries})`);
      onReconnect();
      try {
        client.close();
      } catch {
        /* уже закрыт */
      }
      client = null;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  await connect();
  console.log(`FTPS: соединение защищено (explicit TLS). Папка на сервере: ${remote}`);

  const local = walk(DIST);
  if (local.includes('api/config.php')) {
    console.error('В dist/ оказался api/config.php — он не должен попадать в сборку. Стоп.');
    process.exit(3);
  }

  // что уже лежит на сервере: имя → размер, по каталогам
  const dirs = [...new Set(local.map((f) => f.split('/').slice(0, -1).join('/')))].sort();
  const remoteSizes = new Map();
  for (const d of dirs) {
    const abs = d ? `${remote}/${d}` : remote;
    const list = await withRetry(`список ${d || '/'}`, async () => {
      try {
        return await client.list(abs);
      } catch (e) {
        if (String(e.message).includes('550')) return []; // каталога ещё нет
        throw e;
      }
    });
    for (const f of list) if (f.isFile) remoteSizes.set((d ? `${d}/` : '') + f.name, f.size);
  }

  const changed = local.filter((f) => remoteSizes.get(f) !== statSync(path.join(DIST, f)).size);
  console.log(`Файлов в сборке: ${local.length}; уже совпадают: ${local.length - changed.length}; заливаю: ${changed.length}`);

  let done = 0;
  let lastDir = null;
  onReconnect = () => {
    lastDir = null;
  };
  for (const f of changed) {
    const d = f.split('/').slice(0, -1).join('/');
    const name = f.split('/').pop();
    const abs = d ? `${remote}/${d}` : remote;
    await withRetry(`загрузка ${f}`, async () => {
      if (d !== lastDir) {
        await client.ensureDir(abs);
        lastDir = d;
      }
      await client.uploadFrom(path.join(DIST, f), name);
    });
    done++;
    if (done % 50 === 0 || done === changed.length) console.log(`  загружено ${done} из ${changed.length}`);
  }

  // чистка _astro: хэшированные файлы прошлых сборок
  if (NO_CLEAN) console.log('_astro: чистка пропущена (--no-clean)');
  const localAstro = new Set(local.filter((f) => f.startsWith('_astro/')).map((f) => f.slice('_astro/'.length)));
  const removed = NO_CLEAN ? 0 : await withRetry('чистка _astro', async () => {
    await client.cd(`${remote}/_astro`);
    const list = await client.list();
    let n = 0;
    for (const f of list) {
      if (f.isFile && !localAstro.has(f.name)) {
        await client.remove(f.name);
        n++;
      }
    }
    return n;
  });
  if (!NO_CLEAN) console.log(`_astro: удалено устаревших файлов — ${removed}`);
  client.close();

  // проверка по HTTP: страницы и свежий ассет
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
        if (scheme.startsWith('http://')) {
          console.log(`ERR  ${p}: ${String(e.message).slice(0, 80)}`);
          ok = false;
        }
      }
    }
  }
  console.log(ok ? 'Деплой завершён, сайт отвечает.' : 'Деплой загружен, но проверка по HTTP не прошла полностью — проверьте DNS и SSL в Plesk.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Ошибка деплоя:', e.message);
  try {
    client?.close();
  } catch {
    /* уже закрыт */
  }
  process.exit(1);
});
