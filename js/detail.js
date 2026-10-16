import { getPost, addComment } from './api.js';
import { $, escapeHTML, formatDate, boardName, showToast } from './dom.js';

function renderComments(comments) {
  $('#commentCount').textContent = comments.length;
  $('#commentList').innerHTML = comments.length
    ? comments.map(comment => `<article class="comment"><div class="comment-head"><b>${escapeHTML(comment.nickname)}</b><time>${formatDate(comment.createdAt)}</time></div><p>${escapeHTML(comment.content)}</p></article>`).join('')
    : '<p class="comment-empty">아직 댓글이 없어요. 첫 소식을 남겨 주세요.</p>';
}

function renderPost(post) {
  document.title = `${post.item} · 중일분실물DB`;
  $('#detailBoard').textContent = boardName(post.type);
  $('#detailType').textContent = boardName(post.type);
  $('#detailType').classList.add(post.type);
  $('#detailDate').textContent = formatDate(post.createdAt);
  $('#detailItem').textContent = post.item;
  $('#detailSimple').textContent = post.simpleDescription;
  $('#detailLocationLabel').textContent = post.type === 'found' ? '습득 장소' : '분실 장소';
  $('#detailLocation').textContent = post.location;
  $('#detailStorageWrap').hidden = post.type !== 'found';
  $('#detailStorage').textContent = post.storage || '';
  $('#detailDescription').textContent = post.detailedDescription || '추가 상세 설명이 없습니다.';
  $('#detailAvatar').textContent = (post.nickname || '?').slice(0, 1);
  $('#detailNickname').textContent = post.nickname;
  $('#detailPhoto').innerHTML = post.photo
    ? `<img src="${escapeHTML(post.photo)}" alt="${escapeHTML(post.item)} 사진">`
    : '<span class="placeholder-icon">⌕</span>';

  const commentsPanel = $('#commentsPanel');
  commentsPanel.hidden = post.type !== 'lost';
  $('#detailMain').hidden = false;
  renderComments(post.comments || []);

  if (post.type === 'lost') {
    $('#commentForm').addEventListener('submit', async event => {
      event.preventDefault();
      $('#commentError').textContent = '';
      const data = new FormData(event.currentTarget);
      const comment = { nickname: String(data.get('nickname')).trim(), content: String(data.get('content')).trim() };
      try {
        const result = await addComment(post.id, comment);
        post.comments = result.comments;
        renderComments(post.comments);
        event.currentTarget.reset();
        showToast('댓글을 남겼어요.');
      } catch (error) { $('#commentError').textContent = error.message; }
    });
  }
}

const id = new URLSearchParams(location.search).get('id');
if (!id) {
  $('#detailNotFound').hidden = false;
} else {
  getPost(id).then(({ post }) => renderPost(post)).catch(() => { $('#detailNotFound').hidden = false; });
}
