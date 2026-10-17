async function request(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const response = await fetch(`/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했어요.');
  return payload;
}

export const getPublicConfig = () => request('/config');
export const listPosts = () => request('/posts');
export const getPost = id => request(`/posts/${encodeURIComponent(id)}`);
export const createPost = post => request('/posts', { method: 'POST', body: JSON.stringify(post) });
export const updatePost = (id, post) => request(`/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(post) });
export const deletePost = (id, password) => request(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ password }) });
export const verifyPostPassword = (id, password) => request(`/posts/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify({ password }) });
export const setPostResolved = (id, password, resolved) => request(`/posts/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ password, resolved }) });
export const addComment = (id, comment) => request(`/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify(comment) });

export const updateComment = (postId, commentId, comment) => request(`/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: 'PUT', body: JSON.stringify(comment) });
export const deleteComment = (postId, commentId, credentials) => request(`/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', body: JSON.stringify(credentials) });
