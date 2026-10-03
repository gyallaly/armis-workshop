import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
/** Immutable startup manifest, not a request-to-filesystem path resolver. */
export function builtAssets(dist: string) {
  const files = new Map<string, { body: Buffer; mime: string }>();
  let total = 0;
  function add(path: string, url: string) {
    const stat = lstatSync(path);
    const mime = MIME[extname(path)];
    if (!stat.isFile() || !mime || stat.size > 16 * 1024 * 1024) throw Error('Invalid built asset');
    const body = readFileSync(path);
    total += body.length;
    if (total > 64 * 1024 * 1024) throw Error('Built assets exceed manifest limit');
    files.set(url, { body, mime });
  }
  add(join(dist, 'index.html'), '/');
  files.set('/index.html', files.get('/')!);
  function walk(path: string, url: string, depth: number) {
    if (depth > 8 || !lstatSync(path).isDirectory()) return;
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(item.name) || item.isSymbolicLink()) continue;
      const child = join(path, item.name), key = `${url}/${item.name}`;
      if (item.isDirectory()) walk(child, key, depth + 1);
      else if (item.isFile() && MIME[extname(item.name)] && extname(item.name) !== '.html') add(child, key);
    }
  }
  for (const prefix of ['assets', 'brand', 'fonts']) {
    const path = join(dist, prefix);
    try { walk(path, `/${prefix}`, 0); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  return files;
}
