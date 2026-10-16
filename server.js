import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from './server/security.js';
import { getPosts, findPost, insertPost, replacePost, removePost, appendComment, savePhoto, removePhoto } from './server/storage.js';
import { validatePost, validateComment } from './server/validation.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function publicPost(post) {
  const { passwordSalt, passwordHash, comments, detailedDescription, ...summary } = post;
  return { ...summary, commentCount: Array.isArray(comments) ? comments.length : 0 };
}
function detailedPost(post) {
  const { passwordSalt, passwordHash, ...result } = post;
  return result;
}
function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}
function fail(res, status, error) { send(res, status, { error }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('요청 용량이 너무 커요.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('요청 내용을 읽을 수 없어요.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { res.writeHead(400).end(); return; }

  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  const isPublicFile = new Set(['index.html', 'detail.html', 'styles.css', 'components.css', 'detail.css', 'theme.css', 'school-emblem.png']).has(relative);
  const isScript = /^js\/[a-z\d-]+\.js$/i.test(relative);
  const isUpload = /^uploads\/[a-f\d-]+\.(?:jpg|png|webp|gif)$/i.test(relative);
  if (!isPublicFile && !isScript && !isUpload) { res.writeHead(404).end('Not found'); return; }

  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'
  };
  res.writeHead(200, {
    'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(target).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/posts' && req.method === 'GET') {
    return send(res, 200, { posts: (await getPosts()).map(publicPost) });
  }
  if (pathname === '/api/posts' && req.method === 'POST') {
    const input = validatePost(await readBody(req), { creating: true });
    const passwordFields = await hashPassword(input.password);
    const now = new Date().toISOString();
    let photo = '';
    try { photo = await savePhoto(input.photoData); }
    catch (error) { throw error; }
    const post = {
      id: cryptoRandomId(), type: input.type, item: input.item, location: input.location,
      storage: input.storage, simpleDescription: input.simpleDescription,
      detailedDescription: input.detailedDescription, nickname: input.nickname,
      photo, comments: [], createdAt: now, updatedAt: now, ...passwordFields
    };
    await insertPost(post);
    return send(res, 201, { posts: (await getPosts()).map(publicPost) });
  }

  const match = pathname.match(/^\/api\/posts\/([0-9a-f-]+)(?:\/(verify|comments))?$/i);
  if (match) {
    const [, id, action] = match;
    const post = await findPost(id);
    if (!post) return fail(res, 404, '게시물을 찾을 수 없어요.');

    if (!action && req.method === 'GET') return send(res, 200, { post: detailedPost(post) });
    if (action === 'verify' && req.method === 'POST') {
      const body = await readBody(req);
      if (!await verifyPassword(String(body.password || ''), post)) return fail(res, 403, '비밀번호가 맞지 않아요.');
      return send(res, 200, { ok: true });
    }
    if (action === 'comments' && req.method === 'POST') {
      if (post.type !== 'lost') return fail(res, 400, '분실 게시물에만 댓글을 남길 수 있어요.');
      const comment = validateComment(await readBody(req));
      const created = { id: cryptoRandomId(), ...comment, createdAt: new Date().toISOString() };
      return send(res, 201, { comments: await appendComment(id, created) });
    }
    if (!action && req.method === 'PUT') {
      const body = await readBody(req);
      if (!await verifyPassword(String(body.password || ''), post)) return fail(res, 403, '비밀번호가 맞지 않아요.');
      const input = validatePost(body);
      let photo = post.photo || '';
      if (input.photoData === '') photo = '';
      else if (input.photoData !== post.photo) photo = await savePhoto(input.photoData);
      const updated = {
        ...post, type: input.type, item: input.item, location: input.location,
        storage: input.storage, simpleDescription: input.simpleDescription,
        detailedDescription: input.detailedDescription, nickname: input.nickname,
        photo, updatedAt: new Date().toISOString()
      };
      await replacePost(id, updated);
      if (post.photo && post.photo !== photo) await removePhoto(post.photo);
      return send(res, 200, { posts: (await getPosts()).map(publicPost) });
    }
    if (!action && req.method === 'DELETE') {
      const body = await readBody(req);
      if (!await verifyPassword(String(body.password || ''), post)) return fail(res, 403, '비밀번호가 맞지 않아요.');
      return send(res, 200, { posts: (await removePost(id)).map(publicPost) });
    }
  }

  if (pathname.startsWith('/api/')) return fail(res, 404, '요청한 경로를 찾을 수 없어요.');
  if (req.method !== 'GET') { res.writeHead(405).end('Method not allowed'); return; }
  serveStatic(res, pathname);
}

function cryptoRandomId() { return crypto.randomUUID(); }

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    if (!res.headersSent && !res.destroyed) fail(res, error.status || 500, error.status ? error.message : '서버에서 처리 중 문제가 생겼어요.');
    else res.destroy();
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`중일분실물DB is running at http://localhost:${PORT}`));
