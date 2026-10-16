import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'posts.json');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]\n', 'utf8');

function readFile() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeFile(posts) {
  fs.writeFileSync(DB_FILE, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

function migratePost(post) {
  const legacyDescription = String(post.description || '');
  const migrated = {
    ...post,
    simpleDescription: post.simpleDescription ?? legacyDescription.slice(0, 120),
    detailedDescription: post.detailedDescription ?? legacyDescription,
    storage: post.type === 'lost' ? '' : String(post.storage || ''),
    resolved: post.type === 'lost' && Boolean(post.resolved),
    comments: Array.isArray(post.comments) ? post.comments.filter(comment => comment?.passwordSalt && comment?.passwordHash) : []
  };
  delete migrated.description;
  return migrated;
}

let posts = readFile().map(migratePost);
writeFile(posts);

export async function getPosts() { return posts; }
export async function findPost(id) { return posts.find(post => post.id === id) || null; }
export async function insertPost(post) { posts = [post, ...posts]; writeFile(posts); return posts; }
export async function replacePost(id, updatedPost) {
  posts = posts.map(post => post.id === id ? updatedPost : post);
  writeFile(posts);
  return posts;
}
export async function removePost(id) {
  const deleted = await findPost(id);
  posts = posts.filter(post => post.id !== id);
  writeFile(posts);
  await removePhoto(deleted?.photo);
  return posts;
}
export async function appendComment(id, comment) {
  const post = posts.find(item => item.id === id);
  post.comments = [...(post.comments || []), comment];
  writeFile(posts);
  return post.comments;
}

export async function findComment(postId, commentId) {
  const post = await findPost(postId);
  return post?.comments?.find(comment => comment.id === commentId) || null;
}
export async function replaceComment(postId, updatedComment) {
  const post = await findPost(postId);
  post.comments = post.comments.map(comment => comment.id === updatedComment.id ? updatedComment : comment);
  writeFile(posts);
  return post.comments;
}
export async function removeComment(postId, commentId) {
  const post = await findPost(postId);
  post.comments = post.comments.filter(comment => comment.id !== commentId);
  writeFile(posts);
  return post.comments;
}

export async function savePhoto(dataUrl) {
  if (!dataUrl) return '';
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z\d+/=]+)$/.exec(dataUrl);
  if (!match) throw Object.assign(new Error('JPG, PNG, WEBP, GIF 사진만 올릴 수 있어요.'), { status: 400 });
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('사진은 5MB 이하만 올릴 수 있어요.'), { status: 400 });
  const filename = `${crypto.randomUUID()}${MIME_EXTENSIONS[match[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes, { flag: 'wx' });
  return `/uploads/${filename}`;
}

export async function removePhoto(photo) {
  if (typeof photo !== 'string' || !photo.startsWith('/uploads/')) return;
  const target = path.join(UPLOAD_DIR, path.basename(photo));
  if (target.startsWith(`${UPLOAD_DIR}${path.sep}`)) fs.rmSync(target, { force: true });
}
