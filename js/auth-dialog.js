import { $, showToast } from './dom.js';

const dialog = $('#authDialog');
const form = $('#authForm');
let selectedAction = null;
let selectedPost = null;

export function openAuthDialog(action, post) {
  selectedAction = action;
  selectedPost = post;
  form.reset();
  $('#authError').textContent = '';
  const isEdit = action === 'edit';
  $('#authTitle').textContent = isEdit ? '게시물 수정' : '게시물 삭제';
  $('#authCopy').textContent = isEdit
    ? '게시물을 올릴 때 설정한 비밀번호를 입력해 주세요.'
    : '이 게시물의 비밀번호를 입력하면 삭제됩니다.';
  $('#authSubmit').innerHTML = isEdit ? '수정하기 <span>↗</span>' : '삭제하기 <span>↗</span>';
  dialog.showModal();
}

export function initAuthDialog(onAction) {
  $('#closeAuth').addEventListener('click', () => dialog.close());
  $('#cancelAuth').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    $('#authError').textContent = '';
    const password = String(new FormData(form).get('password') || '');
    const action = selectedAction;
    const post = selectedPost;
    dialog.close();
    try { await onAction({ action, post, password }); }
    catch (error) { showToast(error.message); }
  });
}
