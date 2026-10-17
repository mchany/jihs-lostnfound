const schemaPromises = new WeakMap();
const MAX_POSTS_PER_RUN = 100;
const MAX_IMAGES_PER_RUN = 100;

function oneMonthBefore(date) {
  const cutoff = new Date(date);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff.toISOString();
}

async function readPostColumns(db) {
  const result = await db.prepare('PRAGMA table_info(posts)').all();
  return new Set((result.results || []).map(column => column.name));
}

export async function ensureResolvedCleanupSchema(db) {
  let ready = schemaPromises.get(db);
  if (!ready) {
    ready = (async () => {
      let columns = await readPostColumns(db);
      if (!columns.has('resolved_at')) {
        try {
          await db.prepare('ALTER TABLE posts ADD COLUMN resolved_at TEXT').run();
        } catch (error) {
          columns = await readPostColumns(db);
          if (!columns.has('resolved_at')) throw error;
        }
      }

      await db.prepare(
        "UPDATE posts SET resolved_at = updated_at WHERE resolved = 1 AND resolved_at IS NULL"
      ).run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS post_image_cleanup_queue (
          post_id TEXT PRIMARY KEY,
          object_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `).run();
    })().catch(error => {
      schemaPromises.delete(db);
      throw error;
    });
    schemaPromises.set(db, ready);
  }
  return ready;
}

export async function cleanupExpiredResolvedPosts(db, images, now = new Date()) {
  await ensureResolvedCleanupSchema(db);
  const cutoff = oneMonthBefore(now);
  const candidates = await db.prepare(`
    SELECT id, COALESCE(photo, '') AS photo
    FROM posts
    WHERE resolved = 1 AND resolved_at IS NOT NULL AND resolved_at <= ?
    ORDER BY resolved_at ASC
    LIMIT ?
  `).bind(cutoff, MAX_POSTS_PER_RUN).all();

  let postsDeleted = 0;
  let skippedInvalidPhoto = 0;
  for (const post of candidates.results || []) {
    const photo = post.photo || '';
    let objectKey = '';
    if (photo) {
      const match = /^\/uploads\/([a-f\\d-]+\\.(?:jpg|png|webp|gif))$/i.exec(photo);
      if (!match) {
        skippedInvalidPhoto += 1;
        continue;
      }
      objectKey = match[1];
    }

    const eligible = `id = ? AND resolved = 1 AND resolved_at IS NOT NULL
      AND resolved_at <= ? AND COALESCE(photo, '') = ?`;
    const statements = [];
    if (objectKey) {
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO post_image_cleanup_queue (post_id, object_key, created_at)
        SELECT id, ?, ? FROM posts WHERE ${eligible}
      `).bind(objectKey, now.toISOString(), post.id, cutoff, photo));
    }
    statements.push(db.prepare(`
      DELETE FROM post_comments
      WHERE post_id = ? AND EXISTS (SELECT 1 FROM posts WHERE ${eligible})
    `).bind(post.id, post.id, cutoff, photo));
    statements.push(db.prepare(`DELETE FROM posts WHERE ${eligible}`).bind(post.id, cutoff, photo));

    const result = await db.batch(statements);
    if (Number(result.at(-1)?.meta?.changes || 0) > 0) postsDeleted += 1;
  }

  const queued = await db.prepare(`
    SELECT post_id, object_key FROM post_image_cleanup_queue
    ORDER BY created_at ASC LIMIT ?
  `).bind(MAX_IMAGES_PER_RUN).all();

  let imagesDeleted = 0;
  let pendingImages = 0;
  for (const image of queued.results || []) {
    try {
      await images.delete(image.object_key);
      await db.prepare(
        'DELETE FROM post_image_cleanup_queue WHERE post_id = ? AND object_key = ?'
      ).bind(image.post_id, image.object_key).run();
      imagesDeleted += 1;
    } catch {
      // Keep the outbox row so the next scheduled run retries this idempotent delete.
      pendingImages += 1;
    }
  }

  return { postsDeleted, imagesDeleted, pendingImages, skippedInvalidPhoto };
}
