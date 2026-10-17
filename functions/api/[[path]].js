import { validateComment, validateCommentCredentials, validatePost } from '../../server/validation.js';
import { hashPassword, verifyPassword } from '../_shared/security.js';
import { ensureResolvedCleanupSchema } from '../_shared/resolved-cleanup.js';

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

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ACTION = 'post_create';
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

async function verifyTurnstile(request, token, secret) {
  if (typeof secret !== 'string' || !secret || typeof token !== 'string' || token.length === 0 || token.length > MAX_TURNSTILE_TOKEN_LENGTH) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const body = {
      secret,
      response: token,
      idempotency_key: crypto.randomUUID()
    };
    const remoteIp = request.headers.get('CF-Connecting-IP');
    if (remoteIp) body.remoteip = remoteIp;
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true
      && result.action === TURNSTILE_ACTION
      && result.hostname === new URL(request.url).hostname;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
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
    resolved: Boolean(row.resolved),
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
    comments: comments.map(({ passwordSalt, passwordHash, ...comment }) => comment)
  };
}

function toPublicDetail(post) {
  const { passwordSalt, passwordHash, ...publicDetail } = post;
  return publicDetail;
}

let commentSchemaMigration;
async function ensureCommentSchema(db) {
  if (!commentSchemaMigration) {
    commentSchemaMigration = (async () => {
      const [commentTable, postTable] = await Promise.all([
        db.prepare('PRAGMA table_info(post_comments)').all(),
        db.prepare('PRAGMA table_info(posts)').all()
      ]);
      const commentColumns = new Set((commentTable.results || []).map(column => column.name));
      const postColumns = new Set((postTable.results || []).map(column => column.name));
      const statements = [];
      if (!commentColumns.has('password_salt') || !commentColumns.has('password_hash')) {
        statements.push(db.prepare('DELETE FROM post_comments'));
        if (!commentColumns.has('password_salt')) statements.push(db.prepare("ALTER TABLE post_comments ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''"));
        if (!commentColumns.has('password_hash')) statements.push(db.prepare("ALTER TABLE post_comments ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"));
      }
      if (!postColumns.has('resolved')) statements.push(db.prepare('ALTER TABLE posts ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0'));
      if (statements.length) {
        try {
          await db.batch(statements);
        } catch (error) {
          const [refreshedComments, refreshedPosts] = await Promise.all([
            db.prepare('PRAGMA table_info(post_comments)').all(),
            db.prepare('PRAGMA table_info(posts)').all()
          ]);
          const readyComments = new Set((refreshedComments.results || []).map(column => column.name));
          const readyPosts = new Set((refreshedPosts.results || []).map(column => column.name));
          if (!readyComments.has('password_salt') || !readyComments.has('password_hash') || !readyPosts.has('resolved')) throw error;
        }
      }
      const legacy = await db.prepare("SELECT COUNT(*) AS count FROM post_comments WHERE password_salt = '' OR password_hash = ''").first();
      if (Number(legacy?.count || 0) > 0) await db.prepare('DELETE FROM post_comments').run();
      await ensureResolvedCleanupSchema(db);
    })().catch(error => {
      commentSchemaMigration = null;
      throw error;
    });
  }
  return commentSchemaMigration;
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
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/api/config' && method === 'GET') {
    return json({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
      turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
    });
  }

  let createInput = null;
  if (pathname === '/api/posts' && method === 'POST') {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('게시물 정보를 확인해 주세요.');
    const { turnstileToken, ...postBody } = body;
    createInput = validatePost(postBody, { creating: true });
    if (!await verifyTurnstile(request, turnstileToken, env.TURNSTILE_SECRET_KEY)) {
      return json({ error: '자동 등록 확인에 실패했어요. 다시 인증해 주세요.' }, 403);
    }
  }

  if (!env.DB || !env.IMAGES) throw new Error('Cloudflare D1(DB)와 R2(IMAGES) 바인딩을 설정해 주세요.');
  await ensureCommentSchema(env.DB);

  if (pathname === '/api/posts' && method === 'GET') return json({ posts: await listPosts(env.DB) });

  if (pathname === '/api/posts' && method === 'POST') {
    const input = createInput;
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

  const match = pathname.match(/^\/api\/posts\/([0-9a-f-]+)(?:\/(verify|resolve|comments)(?:\/([0-9a-f-]+))?)?$/i);
  if (!match) return json({ error: '요청한 경로를 찾을 수 없어요.' }, 404);
  const [, id, action, commentId] = match;
  const post = await getPost(env.DB, id);
  if (!post) return json({ error: '게시물을 찾을 수 없어요.' }, 404);

  if (!action && method === 'GET') return json({ post: toPublicDetail(post) });

  if (action === 'verify' && method === 'POST') {
    const body = await readBody(request);
    if (!await verifyPassword(String(body.password || ''), post, env.PASSWORD_PEPPER)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    return json({ ok: true });
  }

  if (action === 'resolve' && method === 'POST') {

    const body = await readBody(request);
    if (typeof body.resolved !== 'boolean') return json({ error: '변경할 상태를 확인해 주세요.' }, 400);
    if (!await verifyPassword(String(body.password || ''), post, env.PASSWORD_PEPPER)) return json({ error: '비밀번호가 맞지 않아요.' }, 403);
    const resolvedAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE posts
      SET resolved = ?,
          resolved_at = CASE WHEN ? = 1 THEN COALESCE(resolved_at, ?) ELSE NULL END,
          updated_at = ?
      WHERE id = ?`)
      .bind(body.resolved ? 1 : 0, body.resolved ? 1 : 0, resolvedAt, resolvedAt, id).run();
    return json({ posts: await listPosts(env.DB) });
  }

  if (action === 'comments' && !commentId && method === 'POST') {

    const input = validateComment(await readBody(request));
    const passwordFields = await hashPassword(input.password, env.PASSWORD_PEPPER);
    const created = { id: crypto.randomUUID(), ...input, ...passwordFields, createdAt: new Date().toISOString() };
    await env.DB.prepare('INSERT INTO post_comments (id, post_id, nickname, content, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(created.id, id, created.nickname, created.content, passwordFields.passwordSalt, passwordFields.passwordHash, created.createdAt).run();
    const result = await env.DB.prepare('SELECT id, nickname, content, created_at FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').bind(id).all();
    const comments = (result.results || []).map(item => ({ id: item.id, nickname: item.nickname, content: item.content, createdAt: item.created_at }));
    return json({ comments }, 201);
  }

  if (action === 'comments' && commentId && (method === 'PUT' || method === 'DELETE')) {

    const body = await readBody(request);
    const credentials = validateCommentCredentials(body);
    const row = await env.DB.prepare('SELECT id, nickname, password_salt, password_hash FROM post_comments WHERE id = ? AND post_id = ? LIMIT 1').bind(commentId, id).first();
    if (!row) return json({ error: '댓글을 찾을 수 없어요.' }, 404);
    const passwordValid = await verifyPassword(credentials.password, { passwordSalt: row.password_salt, passwordHash: row.password_hash }, env.PASSWORD_PEPPER);
    if (!passwordValid || credentials.nickname !== row.nickname) return json({ error: '닉네임 또는 비밀번호가 맞지 않아요.' }, 403);
    if (method === 'PUT') {
      const input = validateComment(body);
      await env.DB.prepare('UPDATE post_comments SET content = ? WHERE id = ? AND post_id = ?')
        .bind(input.content, commentId, id).run();
    } else {
      await env.DB.prepare('DELETE FROM post_comments WHERE id = ? AND post_id = ?')
        .bind(commentId, id).run();
    }
    const result = await env.DB.prepare('SELECT id, nickname, content, created_at FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').bind(id).all();
    const comments = (result.results || []).map(item => ({ id: item.id, nickname: item.nickname, content: item.content, createdAt: item.created_at }));
    return json({ comments });
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
        UPDATE posts SET type = ?, item = ?, location = ?, storage = ?, simple_description = ?, detailed_description = ?, nickname = ?, photo = ?, resolved = ?, updated_at = ? WHERE id = ?
      `).bind(input.type, input.item, input.location, input.storage, input.simpleDescription, input.detailedDescription, input.nickname, photo, post.resolved ? 1 : 0, updatedAt, id).run();
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
