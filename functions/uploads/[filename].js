export async function onRequestGet({ params, env }) {
  const filename = String(params.filename || '');
  if (!/^[a-f\d-]+\.(?:jpg|png|webp|gif)$/i.test(filename)) return new Response('Not found', { status: 404 });
  if (!env.IMAGES) return new Response('Image storage is not configured', { status: 503 });
  const object = await env.IMAGES.get(filename);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}
