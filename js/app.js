import { listPosts, createPost, updatePost, deletePost, verifyPostPassword, setPostResolved } from './api.js';
import { $, $$, showToast } from './dom.js';
import { renderBoard } from './board.js';
import { initPostForm, openPostEditor, closePostForm } from './post-form.js';
import { initAuthDialog, openAuthDialog } from './auth-dialog.js';

let posts = [];
let activeBoard = 'lost';

function render() {
  renderBoard(posts, activeBoard, $('#searchInput').value);
}

async function refreshPosts() {
  const result = await listPosts();
  posts = result.posts;
  render();
}

initPostForm(async (payload, editingId) => {
  const result = editingId ? await updatePost(editingId, payload) : await createPost(payload);
  posts = result.posts;
  activeBoard = payload.type;
  $$('.tab').forEach(tab => {
    const selected = tab.dataset.board === activeBoard;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  closePostForm();
  render();
  showToast(editingId ? '게시물을 수정했어요.' : '게시물을 등록했어요.');
});

initAuthDialog(async ({ action, post, password }) => {
  if (action === 'edit') {
    await verifyPostPassword(post.id, password);
    openPostEditor(post, password);
    return;
  }
  if (action === 'resolve' || action === 'reopen') {
    const resolved = action === 'resolve';
    const result = await setPostResolved(post.id, password, resolved);
    posts = result.posts;
    render();
    showToast(resolved ? '주인을 찾았어요!' : '찾음 상태를 취소했어요.');
    return;
  }
  const result = await deletePost(post.id, password);
  posts = result.posts;
  render();
  showToast('게시물을 삭제했어요.');
});

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  activeBoard = tab.dataset.board;
  $$('.tab').forEach(button => {
    const selected = button === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  render();
}));

$('#searchInput').addEventListener('input', render);
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#searchInput').focus();
  }
});

$('#postGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const post = posts.find(item => item.id === button.dataset.id);
  if (post) openAuthDialog(button.dataset.action, post);
});

refreshPosts().catch(() => {
  $('#resultCount').textContent = '서버 연결이 필요해요';
  showToast('서버가 실행 중인지 확인해 주세요.');
});
