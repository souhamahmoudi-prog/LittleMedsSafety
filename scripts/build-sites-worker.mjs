import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const distDir = new URL('../dist/', import.meta.url);
const serverDir = new URL('../dist/server/', import.meta.url);
const outputFile = new URL('../dist/server/index.js', import.meta.url);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'server' || entry.name === '.openai' || entry.name === '.DS_Store') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

const files = await collectFiles(distDir.pathname);
const manifest = {};

for (const file of files) {
  const path = `/${relative(distDir.pathname, file).replaceAll('\\', '/')}`;
  const bytes = await readFile(file);
  manifest[path] = {
    contentType: contentTypes.get(extname(file).toLowerCase()) || 'application/octet-stream',
    body: bytes.toString('base64'),
  };
}

const worker = `const files = ${JSON.stringify(manifest)};

function normalizePath(pathname) {
  if (pathname.endsWith('/')) return pathname + 'index.html';
  if (!pathname.split('/').pop()?.includes('.')) return pathname + '/index.html';
  return pathname;
}

function responseFor(pathname) {
  const normalized = normalizePath(pathname);
  const file = files[normalized] || files[pathname] || files['/index.html'];
  if (!file) return new Response('Not found', { status: 404 });
  const body = Uint8Array.from(atob(file.body), (char) => char.charCodeAt(0));
  return new Response(body, {
    headers: {
      'content-type': file.contentType,
      'cache-control': file.contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=31536000, immutable',
    },
  });
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    return responseFor(url.pathname);
  },
};
`;

await mkdir(serverDir, { recursive: true });
await writeFile(outputFile, worker);
