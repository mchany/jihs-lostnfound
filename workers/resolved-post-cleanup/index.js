import { cleanupExpiredResolvedPosts } from '../../functions/_shared/resolved-cleanup.js';

export default {
  async scheduled(controller, env) {
    const counts = await cleanupExpiredResolvedPosts(
      env.DB,
      env.IMAGES,
      new Date(controller.scheduledTime)
    );
    console.log(JSON.stringify({
      event: 'resolved-post-cleanup',
      cron: controller.cron,
      ...counts
    }));
  },

  async fetch() {
    return new Response('Not found', { status: 404 });
  }
};
