import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const result = await scrypt(password, salt, 64);
  return { passwordSalt: salt, passwordHash: result.toString('hex') };
}

export async function verifyPassword(password, post) {
  if (!post?.passwordSalt || !post?.passwordHash) return false;
  const attempt = await scrypt(password, post.passwordSalt, 64);
  const expected = Buffer.from(post.passwordHash, 'hex');
  return expected.length === attempt.length && crypto.timingSafeEqual(expected, attempt);
}
