import { getPost, addComment, updateComment, deleteComment } from './api.js';
import { $, escapeHTML, formatDate, boardName, showToast } from './dom.js';

let currentPost = null;
let managedComment = null;
let manageAction = null;

function renderComments(comments) {
  $('#commentCount').textContent = comments.length;
  $('#commentList').innerHTML = comments.length
    ? comments.map(comment => `<article class="comment" data-comment-id="${escapeHTML(comment.id)}"><div class="comment-head"><b>${escapeHTML(comment.nickname)}</b><div class="comment-controls"><time>${formatDate(comment.updatedAt || comment.createdAt)}</time><button type="button" data-comment-action="edit">수정</button><button type="button" data-comment-action="delete">삭제</button></div></div><p>${escapeHTML(comment.content)}</p></article>`).join('')
    : '<p class="comment-empty">아직 댓글이 없어요. 첫 소식을 남겨 주세요.</p>';
}

function openCommentManager(action, comment) {
  managedComment = comment;
  manageAction = action;
  const isEditing = action === 'edit';
  $('#commentManageTitle').textContent = isEditing ? '댓글 수정' : '댓글 삭제';
  $('#commentManageCopy').textContent = isEditing
    ? '작성한 닉네임과 비밀번호를 입력해 댓글을 수정해 주세요.'
    : '작성한 닉네임과 비밀번호를 입력해 댓글을 삭제해 주세요.';
  $('#commentManageContentField').hidden = !isEditing;
  const form = $('#commentManageForm');
  form.elements.nickname.value = comment.nickname;
  form.elements.nickname.readOnly = true;
  form.elements.content.required = isEditing;
  form.elements.content.value = comment.content;
  form.elements.password.value = '';
  $('#commentManageError').textContent = '';
  $('#commentManageSubmit').innerHTML = isEditing ? '수정 완료 <span>↗</span>' : '댓글 삭제 <span>↗</span>';
  $('#commentManageSubmit').classList.toggle('button-danger', !isEditing);
  $('#commentManageDialog').showModal();
}

function closeCommentManager() {
  $('#commentManageDialog').close();
  managedComment = null;
  manageAction = null;
}

$('#commentList').addEventListener('click', event => {
  const button = event.target.closest('[data-comment-action]');
  if (!button) return;
  const commentElement = button.closest('[data-comment-id]');
  const comment = currentPost?.comments?.find(item => item.id === commentElement?.dataset.commentId);
  if (comment) openCommentManager(button.dataset.commentAction, comment);
});

$('#closeCommentManage').addEventListener('click', closeCommentManager);
$('#cancelCommentManage').addEventListener('click', closeCommentManager);
$('#commentManageDialog').addEventListener('click', event => {
  if (event.target === $('#commentManageDialog')) closeCommentManager();
});
$('#commentManageForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentPost || !managedComment) return;
  $('#commentManageError').textContent = '';
  const action = manageAction;
  const data = new FormData(event.currentTarget);
  const credentials = {
    nickname: String(data.get('nickname') || '').trim(),
    password: String(data.get('password') || '')
  };
  try {
    const result = action === 'edit'
      ? await updateComment(currentPost.id, managedComment.id, { ...credentials, content: String(data.get('content') || '').trim() })
      : await deleteComment(currentPost.id, managedComment.id, credentials);
    currentPost.comments = result.comments;
    renderComments(currentPost.comments);
    closeCommentManager();
    showToast(action === 'edit' ? '댓글을 수정했어요.' : '댓글을 삭제했어요.');
  } catch (error) {
    $('#commentManageError').textContent = error.message;
  }
});

function renderPost(post) {
  currentPost = post;
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
  commentsPanel.hidden = false;
  $('#commentsTitle').textContent = post.type === 'found' ? '주인을 알고 계신가요?' : '찾았어요? 알려 주세요.';
  $('#commentsHint').textContent = post.type === 'found'
    ? '이 물건의 주인을 알고 계시다면 댓글로 소식을 남겨 주세요.'
    : '이 분실물을 보았거나 습득했다면 댓글로 소식을 남겨 주세요.';
  $('#detailMain').hidden = false;
  renderComments(post.comments || []);

}


$('#commentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentPost) return;
  $('#commentError').textContent = '';
  const data = new FormData(event.currentTarget);
  const comment = {
    nickname: String(data.get('nickname') || '').trim(),
    content: String(data.get('content') || '').trim(),
    password: String(data.get('password') || '')
  };
  try {
    const result = await addComment(currentPost.id, comment);
    currentPost.comments = result.comments;
    renderComments(currentPost.comments);
    event.currentTarget.reset();
    showToast('댓글을 남겼어요.');
  } catch (error) { $('#commentError').textContent = error.message; }
});

const id = new URLSearchParams(location.search).get('id');
if (!id) {
  $('#detailNotFound').hidden = false;
} else {
  getPost(id).then(({ post }) => renderPost(post)).catch(() => { $('#detailNotFound').hidden = false; });
}
