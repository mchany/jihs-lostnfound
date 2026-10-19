import { $, $$ } from './dom.js';
import { getPublicConfig } from './api.js';

const dialog = $('#postDialog');
const form = $('#postForm');
let editingId = null;
let photo = '';
let turnstileSiteKey = '';
let turnstileEnabled = false;
let turnstileWidgetId = null;
let turnstileApiPromise = null;
let configPromise = null;
let initializationPromise = null;
let turnstileToken = '';
let isSubmitting = false;
let isPreparingPhoto = false;
let photoSelectionId = 0;

const MAX_PHOTO_WIDTH = 1080;

function resizePhotoIfNeeded(file) {
  if (file.type === 'image/gif') return Promise.resolve(file);

  const sourceUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        if (image.naturalWidth <= MAX_PHOTO_WIDTH) {
          resolve(file);
          return;
        }

        const scale = MAX_PHOTO_WIDTH / image.naturalWidth;
        const canvas = document.createElement('canvas');
        canvas.width = MAX_PHOTO_WIDTH;
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('사진을 처리하지 못했어요.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const quality = file.type === 'image/jpeg' || file.type === 'image/webp' ? 0.88 : undefined;
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('사진을 압축하지 못했어요. 다시 선택해 주세요.'));
        }, file.type, quality);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(sourceUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('사진을 읽을 수 없어요. 다시 선택해 주세요.'));
    };
    image.src = sourceUrl;
  });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('사진을 읽을 수 없어요. 다시 선택해 주세요.'));
    reader.readAsDataURL(blob);
  });
}

function setTurnstileStatus(message) {
  $('#turnstileStatus').textContent = message;
}

function updateSubmitState() {
  $('#submitPost').disabled = isSubmitting || (!editingId && (!turnstileEnabled || !turnstileToken));
  $('#closeDialog').disabled = isSubmitting;
  $('#cancelDialog').disabled = isSubmitting;
}

function removeTurnstileWidget() {
  if (turnstileWidgetId !== null && window.turnstile) {
    try { window.turnstile.remove(turnstileWidgetId); } catch {}
  }
  turnstileWidgetId = null;
  $('#turnstileWidget').replaceChildren();
  turnstileToken = '';
}

async function loadPublicConfig(force = false) {
  if (force || !configPromise) {
    configPromise = getPublicConfig().then(config => {
      turnstileSiteKey = typeof config.turnstileSiteKey === 'string' ? config.turnstileSiteKey : '';
      turnstileEnabled = Boolean(config.turnstileEnabled);
      return config;
    }).catch(error => {
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

function loadTurnstileAPI(force = false) {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileApiPromise && !force) return turnstileApiPromise;

  document.querySelector('script[data-turnstile-api]')?.remove();
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  script.dataset.turnstileApi = 'true';

  turnstileApiPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('Turnstile loading timed out'));
    }, 12000);
    script.addEventListener('load', () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile API unavailable'));
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Turnstile loading failed'));
    }, { once: true });
    document.head.append(script);
  }).catch(error => {
    turnstileApiPromise = null;
    throw error;
  });

  return turnstileApiPromise;
}

function showTurnstileFailure(message) {
  turnstileToken = '';
  setTurnstileStatus(message);
  $('#turnstileRetry').hidden = false;
  updateSubmitState();
}

async function initializeTurnstile(force = false) {
  if (editingId) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    turnstileToken = '';
    $('#turnstileRetry').hidden = true;
    setTurnstileStatus('인증을 불러오고 있어요.');
    updateSubmitState();

    try {
      const config = await loadPublicConfig(force);
      if (!config.turnstileSiteKey) throw new Error('Turnstile site key is not configured');

      const turnstile = await loadTurnstileAPI(force);
      removeTurnstileWidget();
      const size = window.matchMedia('(max-width: 420px)').matches ? 'compact' : 'flexible';
      turnstileWidgetId = turnstile.render('#turnstileWidget', {
        sitekey: turnstileSiteKey,
        action: 'post_create',
        size,
        theme: 'auto',
        retry: 'auto',
        'refresh-expired': 'manual',
        'refresh-timeout': 'manual',
        callback(token) {
          turnstileToken = token;
          if (turnstileEnabled) {
            setTurnstileStatus('인증이 완료됐어요. 게시할 수 있어요.');
            $('#turnstileRetry').hidden = true;
          } else {
            showTurnstileFailure('인증 서버 설정이 끝나야 게시할 수 있어요. 설정 후 다시 시도해 주세요.');
          }
          updateSubmitState();
        },
        'error-callback'() {
          showTurnstileFailure('인증 중 문제가 생겼어요. 다시 시도해 주세요.');
        },
        'expired-callback'() {
          showTurnstileFailure('인증이 만료됐어요. 다시 인증해 주세요.');
        },
        'timeout-callback'() {
          showTurnstileFailure('인증 시간이 초과됐어요. 다시 인증해 주세요.');
        }
      });

      if (turnstileEnabled) {
        setTurnstileStatus('게시 전에 인증을 완료해 주세요.');
        $('#turnstileRetry').hidden = true;
      } else {
        showTurnstileFailure('인증 서버 설정이 끝나야 게시할 수 있어요. 설정 후 다시 시도해 주세요.');
      }
      updateSubmitState();
    } catch {
      removeTurnstileWidget();
      showTurnstileFailure('인증을 불러오지 못했어요. 다시 시도해 주세요.');
    }
  })().finally(() => {
    initializationPromise = null;
  });

  return initializationPromise;
}

function setType(type) {
  $$('input[name="type"]').forEach(input => input.closest('.type-option').classList.toggle('selected', input.value === type));
  $('#locationLabel').innerHTML = `${type === 'found' ? '습득 장소' : '분실 장소'} <i>*</i>`;
  const isFound = type === 'found';
  $('#storageField').hidden = !isFound;
  $('input[name="storage"]').required = isFound;
  $('#foundDateField').hidden = !isFound;
  $('input[name="foundDate"]').required = isFound;
  $('#foundTimeField').hidden = !isFound;
  if (!isFound) {
    $('input[name="storage"]').value = '';
    $('input[name="foundDate"]').value = '';
    $('input[name="foundTime"]').value = '';
  }
}

function clearPhoto() {
  photoSelectionId += 1;
  isPreparingPhoto = false;
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
  $('#turnstileField').hidden = false;
  $('#turnstileRetry').hidden = true;
  setTurnstileStatus('게시 전에 자동 등록 방지 인증을 완료해 주세요.');
  turnstileToken = '';
  if (turnstileWidgetId !== null && window.turnstile) {
    try { window.turnstile.reset(turnstileWidgetId); } catch {}
  }
  setType('lost');
  updateSubmitState();
}

export function openPostForm() {
  resetForm();
  dialog.showModal();
  void initializeTurnstile();
}

export function openPostEditor(post, password) {
  resetForm();
  editingId = post.id;
  $('#turnstileField').hidden = true;
  $('input[name="type"][value="' + post.type + '"]').checked = true;
  setType(post.type);
  $('input[name="item"]').value = post.item;
  $('input[name="location"]').value = post.location;
  $('input[name="storage"]').value = post.storage || '';
  $('input[name="foundDate"]').value = post.foundDate || '';
  $('input[name="foundTime"]').value = post.foundTime || '';
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
  updateSubmitState();
  dialog.showModal();
}

export function setFormError(message) { $('#formError').textContent = message || ''; }
export function closePostForm() { dialog.close(); }

export function initPostForm(onSubmit) {
  $('#openPost').addEventListener('click', openPostForm);
  $('#emptyPost').addEventListener('click', openPostForm);
  $('#closeDialog').addEventListener('click', () => dialog.close());
  $('#cancelDialog').addEventListener('click', () => dialog.close());
  $('#turnstileRetry').addEventListener('click', () => void initializeTurnstile(true));
  dialog.addEventListener('click', event => { if (event.target === dialog && !isSubmitting) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (isSubmitting) event.preventDefault(); });
  dialog.addEventListener('close', resetForm);
  $$('input[name="type"]').forEach(input => input.addEventListener('change', () => setType(input.value)));

  $('#photoInput').addEventListener('change', async () => {
    const file = $('#photoInput').files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFormError('이미지 파일을 선택해 주세요.'); clearPhoto(); return; }
    if (file.size > 5 * 1024 * 1024) { setFormError('사진은 5MB 이하만 올릴 수 있어요.'); clearPhoto(); return; }

    const selectionId = ++photoSelectionId;
    isPreparingPhoto = true;
    $('.upload-copy b').textContent = '사진을 준비하고 있어요…';
    setFormError('');
    try {
      const preparedPhoto = await resizePhotoIfNeeded(file);
      if (selectionId !== photoSelectionId) return;
      const dataUrl = await readAsDataUrl(preparedPhoto);
      if (selectionId !== photoSelectionId) return;
      photo = dataUrl;
      $('#uploadPreview').style.backgroundImage = `url("${photo}")`;
      $('#removePhoto').style.display = 'block';
      $('.upload-copy b').textContent = file.name;
    } catch (error) {
      if (selectionId !== photoSelectionId) return;
      photo = '';
      $('#uploadPreview').style.backgroundImage = '';
      $('#removePhoto').style.display = 'none';
      $('.upload-copy b').textContent = '사진을 추가해 주세요';
      $('#photoInput').value = '';
      setFormError(error.message || '사진을 처리하지 못했어요. 다시 선택해 주세요.');
    } finally {
      if (selectionId === photoSelectionId) isPreparingPhoto = false;
    }
  });
  $('#removePhoto').addEventListener('click', clearPhoto);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSubmitting) return;
    if (isPreparingPhoto) { setFormError('사진을 처리하고 있어요. 잠시만 기다려 주세요.'); return; }
    setFormError('');

    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (password.length < 4 || password.length > 32) { setFormError('비밀번호는 4자 이상, 32자 이하로 입력해 주세요.'); return; }

    const isCreating = !editingId;
    let token = '';
    if (isCreating) {
      try { token = turnstileWidgetId !== null && window.turnstile ? window.turnstile.getResponse(turnstileWidgetId) : ''; }
      catch { token = ''; }
      if (!turnstileEnabled || !token || !turnstileToken) {
        setFormError('게시하기 전에 인증을 완료해 주세요. 인증을 다시 시도할 수 있어요.');
        updateSubmitState();
        return;
      }
    }

    const payload = {
      type: data.get('type'), item: String(data.get('item')).trim(), location: String(data.get('location')).trim(),
      storage: String(data.get('storage') || '').trim(), foundDate: String(data.get('foundDate') || ''), foundTime: String(data.get('foundTime') || ''),
      simpleDescription: String(data.get('simpleDescription') || '').trim(),
      detailedDescription: String(data.get('detailedDescription') || '').trim(), nickname: String(data.get('nickname')).trim(), password, photo
    };
    if (isCreating) payload.turnstileToken = token;

    isSubmitting = true;
    updateSubmitState();
    try { await onSubmit(payload, editingId); }
    catch (error) {
      setFormError(error.message);
      if (isCreating) {
        turnstileToken = '';
        if (turnstileWidgetId !== null && window.turnstile) {
          try { window.turnstile.reset(turnstileWidgetId); } catch {}
        }
        setTurnstileStatus('등록 요청이 끝났어요. 다시 게시하려면 새 인증을 완료해 주세요.');
      }
    } finally {
      isSubmitting = false;
      updateSubmitState();
    }
  });
}
