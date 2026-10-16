import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'posts.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'lost-found-images';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

if (Boolean(SUPABASE_URL) !== Boolean(SUPABASE_KEY)) {
  throw new Error('Supabase 연결을 위해 SUPABASE_URL과 SUPABASE_SECRET_KEY를 함께 설정해 주세요.');
}

function supabaseHeaders(extra = {}) {
  const authorization = SUPABASE_KEY.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${SUPABASE_KEY}` };
  return { apikey: SUPABASE_KEY, ...authorization, ...extra };
}

async function supabaseRequest(pathname, { method = 'GET', body, prefer } = {}) {
  const headers = supabaseHeaders({ ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(prefer ? { Prefer: prefer } : {}) });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || `Supabase 요청이 실패했어요 (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

function toDatabasePost(post) {
  return {
    id: post.id,
    type: post.type,
    item: post.item,
    location: post.location,
    storage: post.storage || '',
    simple_description: post.simpleDescription,
    detailed_description: post.detailedDescription || '',
    nickname: post.nickname,
    photo: post.photo || '',
    password_salt: post.passwordSalt,
    password_hash: post.passwordHash,
    created_at: post.createdAt,
    updated_at: post.updatedAt
  };
}

function fromDatabasePost(row, comments = []) {
  return {
    id: row.id,
    type: row.type,
    item: row.item,
    location: row.location,
    storage: row.storage || '',
    simpleDescription: row.simple_description || '',
    detailedDescription: row.detailed_description || '',
    nickname: row.nickname,
    photo: row.photo || '',
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    comments
  };
}

function fromDatabaseComment(row) {
  return { id: row.id, nickname: row.nickname, content: row.content, createdAt: row.created_at };
}

async function getSupabaseComments(postIds) {
  if (!postIds.length) return new Map();
  const ids = postIds.map(id => `"${id}"`).join(',');
  const rows = await supabaseRequest(`post_comments?select=*&post_id=in.(${encodeURIComponent(ids)})&order=created_at.asc`);
  const grouped = new Map(postIds.map(id => [id, []]));
  for (const row of rows || []) grouped.get(row.post_id)?.push(fromDatabaseComment(row));
  return grouped;
}

async function getSupabasePosts() {
  const rows = await supabaseRequest('posts?select=*&order=created_at.desc');
  const comments = await getSupabaseComments((rows || []).map(row => row.id));
  return (rows || []).map(row => fromDatabasePost(row, comments.get(row.id) || []));
}

async function getSupabasePost(id) {
  const rows = await supabaseRequest(`posts?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows?.length) return null;
  const comments = await supabaseRequest(`post_comments?select=*&post_id=eq.${encodeURIComponent(id)}&order=created_at.asc`);
  return fromDatabasePost(rows[0], (comments || []).map(fromDatabaseComment));
}

function readLocalPosts() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeLocalPosts(posts) {
  fs.writeFileSync(DB_FILE, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

function migratePost(post) {
  const legacyDescription = String(post.description || '');
  const migrated = {
    ...post,
    simpleDescription: post.simpleDescription ?? legacyDescription.slice(0, 120),
    detailedDescription: post.detailedDescription ?? legacyDescription,
    storage: post.type === 'lost' ? '' : String(post.storage || ''),
    comments: Array.isArray(post.comments) ? post.comments : []
  };
  delete migrated.description;
  return migrated;
}

let localPosts = [];
if (!USE_SUPABASE) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]\n', 'utf8');
  localPosts = readLocalPosts().map(migratePost);
  writeLocalPosts(localPosts);
}

export async function getPosts() {
  return USE_SUPABASE ? getSupabasePosts() : localPosts;
}

export async function findPost(id) {
  return USE_SUPABASE ? getSupabasePost(id) : localPosts.find(post => post.id === id) || null;
}

export async function insertPost(post) {
  if (USE_SUPABASE) {
    await supabaseRequest('posts', { method: 'POST', body: toDatabasePost(post), prefer: 'return=minimal' });
    return getSupabasePosts();
  }
  localPosts = [post, ...localPosts];
  writeLocalPosts(localPosts);
  return localPosts;
}

export async function replacePost(id, updatedPost) {
  if (USE_SUPABASE) {
    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: toDatabasePost(updatedPost), prefer: 'return=minimal' });
    return getSupabasePosts();
  }
  localPosts = localPosts.map(post => post.id === id ? updatedPost : post);
  writeLocalPosts(localPosts);
  return localPosts;
}

export async function removePost(id) {
  const deleted = await findPost(id);
  if (USE_SUPABASE) {
    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    await removePhoto(deleted?.photo);
    return getSupabasePosts();
  }
  localPosts = localPosts.filter(post => post.id !== id);
  writeLocalPosts(localPosts);
  await removePhoto(deleted?.photo);
  return localPosts;
}

export async function appendComment(id, comment) {
  if (USE_SUPABASE) {
    await supabaseRequest('post_comments', {
      method: 'POST',
      body: { id: comment.id, post_id: id, nickname: comment.nickname, content: comment.content, created_at: comment.createdAt },
      prefer: 'return=minimal'
    });
    const rows = await supabaseRequest(`post_comments?select=*&post_id=eq.${encodeURIComponent(id)}&order=created_at.asc`);
    return (rows || []).map(fromDatabaseComment);
  }
  const post = localPosts.find(item => item.id === id);
  post.comments = [...(post.comments || []), comment];
  writeLocalPosts(localPosts);
  return post.comments;
}

export async function savePhoto(dataUrl) {
  if (!dataUrl) return '';
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z\d+/=]+)$/.exec(dataUrl);
  if (!match) throw Object.assign(new Error('JPG, PNG, WEBP, GIF 사진만 올릴 수 있어요.'), { status: 400 });
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('사진은 5MB 이하만 올릴 수 있어요.'), { status: 400 });
  if (USE_SUPABASE) {
    const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[match[1]]}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${filename}`, {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': match[1], 'x-upsert': 'false' }),
      body: bytes
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || payload.error || `사진 저장에 실패했어요 (${response.status}).`);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/${filename}`;
  }
  const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[match[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes, { flag: 'wx' });
  return `/uploads/${filename}`;
}

export async function removePhoto(photo) {
  if (typeof photo !== 'string' || !photo) return;
  if (USE_SUPABASE && photo.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/`)) {
    const filename = photo.slice(photo.lastIndexOf('/') + 1);
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}`, {
      method: 'DELETE',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [filename] })
    });
    if (!response.ok) throw new Error('기존 사진을 삭제하지 못했어요.');
    return;
  }
  if (!photo.startsWith('/uploads/')) return;
  const target = path.join(UPLOAD_DIR, path.basename(photo));
  if (target.startsWith(`${UPLOAD_DIR}${path.sep}`)) fs.rmSync(target, { force: true });
}
