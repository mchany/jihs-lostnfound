import { $, $$ } from './dom.js';

const dialog = $('#postDialog');
const form = $('#postForm');
let editingId = null;
let photo = '';

function setType(type) {
  $$('input[name="type"]').forEach(input => input.closest('.type-option').classList.toggle('selected', input.value === type));
  $('#locationLabel').innerHTML = `${type === 'found' ? '습득 장소' : '분실 장소'} <i>*</i>`;
  const isFound = type === 'found';
  $('#storageField').hidden = !isFound;
  $('input[name="storage"]').required = isFound;
  if (!isFound) $('input[name="storage"]').value = '';
}

function clearPhoto() {
  photo = '';
  $('#photoInput').value = '';
  $('#uploadPreview').style.backgroundImage = '';
  $('#removePhoto').style.display = 'none';
  $('.upload-copy b').textContent = '사진을 추가해 주세요';
}

function resetForm() {
  form.reset();
  editingId = null;
  clearPhoto();
  $('#formError').textContent = '';
  $('#dialogTitle').textContent = '게시물 올리기';
  $('#submitPost').innerHTML = '게시물 등록 <span>↗</span>';
  $('input[name="password"]').required = true;
  $('input[name="password"]').readOnly = false;
  $('input[name="type"][value="lost"]').checked = true;
  setType('lost');
}

export function openPostForm() {
  resetForm();
  dialog.showModal();
}

export function openPostEditor(post, password) {
  resetForm();
  editingId = post.id;
  $('input[name="type"][value="' + post.type + '"]').checked = true;
  setType(post.type);
  $('input[name="item"]').value = post.item;
  $('input[name="location"]').value = post.location;
  $('input[name="storage"]').value = post.storage || '';
  $('textarea[name="simpleDescription"]').value = post.simpleDescription || '';
  $('textarea[name="detailedDescription"]').value = post.detailedDescription || '';
  $('input[name="nickname"]').value = post.nickname;
  $('input[name="password"]').value = password;
  $('input[name="password"]').readOnly = true;
  photo = post.photo || '';
  if (photo) {
    $('#uploadPreview').style.backgroundImage = `url("${photo}")`;
    $('#removePhoto').style.display = 'block';
    $('.upload-copy b').textContent = '사진이 등록되어 있어요';
  }
  $('#dialogTitle').textContent = '게시물 수정';
  $('#submitPost').innerHTML = '수정 완료 <span>↗</span>';
  dialog.showModal();
}

export function setFormError(message) { $('#formError').textContent = message || ''; }
export function closePostForm() { dialog.close(); }

export function initPostForm(onSubmit) {
  $('#openPost').addEventListener('click', openPostForm);
  $('#emptyPost').addEventListener('click', openPostForm);
  $('#closeDialog').addEventListener('click', () => dialog.close());
  $('#cancelDialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', resetForm);
  $$('input[name="type"]').forEach(input => input.addEventListener('change', () => setType(input.value)));

  $('#photoInput').addEventListener('change', () => {
    const file = $('#photoInput').files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFormError('이미지 파일을 선택해 주세요.'); clearPhoto(); return; }
    if (file.size > 5 * 1024 * 1024) { setFormError('사진은 5MB 이하만 올릴 수 있어요.'); clearPhoto(); return; }
    const reader = new FileReader();
    reader.onload = () => {
      photo = String(reader.result);
      $('#uploadPreview').style.backgroundImage = `url("${photo}")`;
      $('#removePhoto').style.display = 'block';
      $('.upload-copy b').textContent = file.name;
      setFormError('');
    };
    reader.readAsDataURL(file);
  });
  $('#removePhoto').addEventListener('click', clearPhoto);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setFormError('');
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (password.length < 4 || password.length > 32) { setFormError('비밀번호는 4자 이상, 32자 이하로 입력해 주세요.'); return; }
    const payload = {
      type: data.get('type'), item: String(data.get('item')).trim(), location: String(data.get('location')).trim(),
      storage: String(data.get('storage') || '').trim(), simpleDescription: String(data.get('simpleDescription') || '').trim(),
      detailedDescription: String(data.get('detailedDescription') || '').trim(), nickname: String(data.get('nickname')).trim(), password, photo
    };
    try { await onSubmit(payload, editingId); }
    catch (error) { setFormError(error.message); }
  });
}
