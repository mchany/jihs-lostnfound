const ITERATIONS = 20_000;
const HASH_LENGTH = 32;

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  if (!/^(?:[a-f\d]{2})+$/i.test(value)) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g), part => Number.parseInt(part, 16));
}

async function derive(password, pepper, salt) {
  const material = new TextEncoder().encode(`${password}\u0000${pepper}`);
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, HASH_LENGTH * 8);
}

function requirePepper(pepper) {
  if (typeof pepper !== 'string' || pepper.length < 32) throw new Error('Cloudflare Pages의 PASSWORD_PEPPER secret을 32자 이상으로 설정해 주세요.');
}

export async function hashPassword(password, pepper) {
  requirePepper(pepper);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, pepper, salt);
  return { passwordSalt: toHex(salt), passwordHash: toHex(hash) };
}

export async function verifyPassword(password, post, pepper) {
  requirePepper(pepper);
  const expected = fromHex(post.passwordHash);
  const actual = new Uint8Array(await derive(password, pepper, fromHex(post.passwordSalt)));
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
  return difference === 0;
}
