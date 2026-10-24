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
  const isResolve = action === 'resolve';
  const isReopen = action === 'reopen';
  $('#authTitle').textContent = isEdit ? '게시물 수정' : isResolve ? '주인을 찾았어요' : isReopen ? '찾음 상태 취소' : '게시물 삭제';
  $('#authCopy').textContent = isEdit
    ? '게시물을 올릴 때 설정한 비밀번호를 입력해 주세요.'
    : isResolve
      ? '게시물 작성 때 설정한 비밀번호를 입력하면 썸네일에 찾음 상태가 표시됩니다.'
      : isReopen
        ? '게시물 작성 때 설정한 비밀번호를 입력하면 찾음 상태를 취소합니다.'
        : '이 게시물의 비밀번호를 입력하면 삭제됩니다.';
  $('#authSubmit').innerHTML = isEdit ? '수정하기' : isResolve ? '주인을 찾았어요' : isReopen ? '찾음 취소' : '삭제하기';
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
