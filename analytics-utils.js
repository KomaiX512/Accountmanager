// analytics-utils.js
// Lightweight helper functions for post analytics. Designed to be imported wherever
// data-driven insights are required without pulling additional heavy deps.

/**
 * Return top-k posts sorted by a given engagement metric.
 * @param {Array<Object>} posts - Array of post objects with engagement fields.
 * @param {string} metric - One of 'likes', 'comments', 'shares', 'totalEngagement'.
 * @param {number} k - Number of top posts to return.
 * @returns {Array<Object>} Top-k posts.
 */
export function getTopKPosts(posts = [], metric = 'totalEngagement', k = 3) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const validMetric = metric;
  // Compute totalEngagement if not present
  const enriched = posts.map((p) => {
    if (typeof p.totalEngagement === 'undefined') {
      const likes = p.likesCount || p.likes || 0;
      const comments = p.commentsCount || p.comments || 0;
      const shares = p.sharesCount || p.shares || 0;
      return {
        ...p,
        totalEngagement: likes + comments + shares,
      };
    }
    return p;
  });
  return enriched
    .sort((a, b) => (b[validMetric] || 0) - (a[validMetric] || 0))
    .slice(0, k);
}

/**
 * Calculate aggregate statistics across posts.
 * @param {Array<Object>} posts - Array of post objects.
 * @returns {Object} { avgLikes, avgComments, avgShares, totalPosts, avgEngagement }
 */
export function getAggregateStats(posts = []) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return {
      avgLikes: 0,
      avgComments: 0,
      avgShares: 0,
      totalPosts: 0,
      avgEngagement: 0,
    };
  }

  const totals = posts.reduce(
    (acc, p) => {
      acc.likes += p.likesCount || p.likes || 0;
      acc.comments += p.commentsCount || p.comments || 0;
      acc.shares += p.sharesCount || p.shares || 0;
      return acc;
    },
    { likes: 0, comments: 0, shares: 0 }
  );

  const totalPosts = posts.length;
  const avgLikes = Math.round(totals.likes / totalPosts);
  const avgComments = Math.round(totals.comments / totalPosts);
  const avgShares = Math.round(totals.shares / totalPosts);
  const avgEngagement = Math.round((totals.likes + totals.comments + totals.shares) / totalPosts);

  return { avgLikes, avgComments, avgShares, totalPosts, avgEngagement };
}
