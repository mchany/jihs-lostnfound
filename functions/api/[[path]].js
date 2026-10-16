import { validateComment, validatePost } from '../../server/validation.js';
import { hashPassword, verifyPassword } from '../_shared/security.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif']]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

function errorResponse(error) {
  const status = Number(error.status) || 500;
  return json({ error: status < 500 ? error.message : '서버에서 처리 중 문제가 생겼어요.' }, status);
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 8 * 1024 * 1024) throw fail('요청 용량이 너무 커요.', 413);
  try {
    const text = await request.text();
    if (text.length > 8 * 1024 * 1024) throw fail('요청 용량이 너무 커요.', 413);
    return JSON.parse(text || '{}');
  }
  catch (error) { if (error.status) throw error; throw fail('요청 내용을 읽을 수 없어요.'); }
}

function toPublicPost(row) {
  return {
    id: row.id,
    type: row.type,
    item: row.item,
    location: row.location,
    storage: row.storage || '',
    simpleDescription: row.simple_description,
    nickname: row.nickname,
    photo: row.photo || '',
    commentCount: Number(row.comment_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPost(row, comments = []) {
  return {
    ...toPublicPost(row),
    detailedDescription: row.detailed_description || '',
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    comments
  };
}

async function listPosts(db) {
  const result = await db.prepare(`
    SELECT p.*, COUNT(c.id) AS comment_count
    FROM posts p LEFT JOIN post_comments c ON c.post_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `).all();
  return (result.results || []).map(toPublicPost);
}

async function getPost(db, id) {
  const row = await db.prepare(`
    SELECT p.*, COUNT(c.id) AS comment_count
    FROM posts p LEFT JOIN post_comments c ON c.post_id = p.id
    WHERE p.id = ? GROUP BY p.id LIMIT 1
  `).bind(id).first();
  if (!row) return null;
  const result = await db.prepare('SELECT id, nickname, content, created_at FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').bind(id).all();
  const comments = (result.results || []).map(comment => ({ id: comment.id, nickname: comment.nickname, content: comment.content, createdAt: comment.created_at }));
  return toPost(row, comments);
}

async function storePhoto(bucket, dataUrl) {
  if (!dataUrl) return '';
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z\d+/=]+)$/.exec(dataUrl);
  if (!match) throw fail('JPG, PNG, WEBP, GIF 사진만 올릴 수 있어요.');
  const [, mimeType, encoded] = match;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) throw fail('사진은 5MB 이하만 올릴 수 있어요.');
  let binary;
  try { binary = atob(encoded); }
  catch { throw fail('사진 파일을 읽을 수 없어요.'); }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw fail('사진은 5MB 이하만 올릴 수 있어요.');
  const extension = IMAGE_TYPES.get(mimeType);
  const filename = `${crypto.randomUUID()}.${extension}`;
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  await bucket.put(filename, bytes, { httpMetadata: { contentType: mimeType } });
  return `/uploads/${filename}`;
}

async function deletePhoto(bucket, photo) {
  const match = /^\/uploads\/([a-f\d-]+\.(?:jpg|png|webp|gif))$/i.exec(photo || '');
  if (match) await bucket.delete(match[1]);
}

async function handle(request, env) {
  if (!env.DB || !env.IMAGES) throw new Error('Cloudflare D1(DB)와 R2(IMAGES) 바인딩을 설정해 주세요.');
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/api/posts' && method === 'GET') return json({ posts: await listPosts(env.DB) });

  if (pathname === '/api/posts' && method === 'POST') {
    const input = validatePost(await readBody(request), { creating: true });
    const passwordFields = await hashPassword(input.password, env.PASSWORD_PEPPER);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const photo = await storePhoto(env.IMAGES, input.photoData);
    try {
      await env.DB.prepare(`
        INSERT INTO posts (id, type, item, location, storage, simple_description, detailed_description, nickname, photo, password_salt, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, input.type, input.item, input.location, input.storage, input.simpleDescription, input.detailedDescription, input.nickname, photo, passwordFields.passwordSalt, passwordFields.passwordHash, now, now).run();
    } catch (error) {
      await deletePhoto(env.IMAGES, photo);
      throw error;
    }
    return json({ posts: await listPosts(env.DB) }, 201);
  }

  const match = pathname.match(/^\/api\/posts\/([0-9a-f-]+)(?:\/(verify|comments))?$/i);
  if (!match) return json({ error: '요청한 경로를 찾을 수 없어요.' }, 404);
  const [, id, action] = match;
  const post = await getPost(env.DB, id);
  if (!post) return json({ error: '게시물을 찾을 수 없어요.' }, 404);

  if (!action && method === 'GET') return json({ post });

  if (action === 'verify' && method === 'POST') {
    const body = await readBody(request);
    if (!await verifyPassword(String(body.password || ''), post, env.PASSWORD_PEPPER)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    return json({ ok: true });
  }

  if (action === 'comments' && method === 'POST') {
    if (post.type !== 'lost') return json({ error: '분실 게시물에만 댓글을 남길 수 있어요.' }, 400);
    const comment = validateComment(await readBody(request));
    const created = { id: crypto.randomUUID(), ...comment, createdAt: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO post_comments (id, post_id, nickname, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(created.id, id, created.nickname, created.content, created.createdAt).run();
    const result = await env.DB.prepare('SELECT id, nickname, content, created_at FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').bind(id).all();
    const comments = (result.results || []).map(item => ({ id: item.id, nickname: item.nickname, content: item.content, createdAt: item.created_at }));
    return json({ comments }, 201);
  }

  if (!action && method === 'PUT') {
    const body = await readBody(request);
    if (!await verifyPassword(String(body.password || ''), post, env.PASSWORD_PEPPER)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    const input = validatePost(body);
    let photo = post.photo || '';
    if (input.photoData === '') photo = '';
    else if (input.photoData !== post.photo) photo = await storePhoto(env.IMAGES, input.photoData);
    const updatedAt = new Date().toISOString();
    try {
      await env.DB.prepare(`
        UPDATE posts SET type = ?, item = ?, location = ?, storage = ?, simple_description = ?, detailed_description = ?, nickname = ?, photo = ?, updated_at = ? WHERE id = ?
      `).bind(input.type, input.item, input.location, input.storage, input.simpleDescription, input.detailedDescription, input.nickname, photo, updatedAt, id).run();
    } catch (error) {
      if (photo !== post.photo) await deletePhoto(env.IMAGES, photo);
      throw error;
    }
    if (post.photo && post.photo !== photo) await deletePhoto(env.IMAGES, post.photo);
    return json({ posts: await listPosts(env.DB) });
  }

  if (!action && method === 'DELETE') {
    const body = await readBody(request);
    if (!await verifyPassword(String(body.password || ''), post, env.PASSWORD_PEPPER)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    await deletePhoto(env.IMAGES, post.photo);
    return json({ posts: await listPosts(env.DB) });
  }

  return json({ error: '지원하지 않는 요청이에요.' }, 405);
}

export async function onRequest(context) {
  try { return await handle(context.request, context.env); }
  catch (error) { return errorResponse(error); }
}
