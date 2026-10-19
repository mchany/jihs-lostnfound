import { $, escapeHTML, formatDate, boardName } from './dom.js';

export function renderBoard(posts, activeBoard, query = '') {
  const grid = $('#postGrid');
  const normalizedQuery = query.trim().toLocaleLowerCase('ko');
  $('#lostCount').textContent = posts.filter(post => post.type === 'lost').length;
  $('#foundCount').textContent = posts.filter(post => post.type === 'found').length;
  $('#boardIntroLabel').textContent = boardName(activeBoard);

  const shown = posts.filter(post => post.type === activeBoard && (!normalizedQuery ||
    [post.item, post.location, post.storage, post.simpleDescription].join(' ').toLocaleLowerCase('ko').includes(normalizedQuery)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#resultCount').textContent = `${shown.length}개의 게시물`;
  grid.innerHTML = shown.map(post => {
    const detailUrl = `/detail.html?id=${encodeURIComponent(post.id)}`;
    const photo = post.photo
      ? `<img src="${escapeHTML(post.photo)}" alt="${escapeHTML(post.item)} 사진">`
      : `<div class="post-placeholder"><span class="placeholder-icon">${post.type === 'found' ? '⌕' : '↗'}</span></div>`;
    const storage = post.type === 'found'
      ? `<div class="meta-line"><span>보관</span><b>${escapeHTML(post.storage)}</b></div>` : '';
    const eventDate = `<div class="meta-line"><span>${post.type === 'found' ? '발견 날짜' : '분실 날짜'}</span><b>${escapeHTML(post.eventDate || '미입력')}</b></div>`;
    const eventTime = post.eventTime
      ? `<div class="meta-line"><span>${post.type === 'found' ? '발견 시간' : '분실 시간'}</span><b>${escapeHTML(post.eventTime)}</b></div>`
      : '';
    const foundMeta = post.type === 'found' ? storage : '';
    const comments = `<span class="post-comment-count">댓글 ${Number(post.commentCount) || 0}</span>`;
    const isResolved = Boolean(post.resolved);
    const resolvedClass = isResolved ? ' is-resolved' : '';
    const resolvedBanner = isResolved ? '<span class="post-resolved-banner">주인을 찾았어요</span>' : '';
    const resolveAction = `<button type="button" data-action="${isResolved ? 'reopen' : 'resolve'}" data-id="${escapeHTML(post.id)}">${isResolved ? '찾음 취소' : '주인을 찾았어요'}</button>`;
    return `<article class="post-card">
      <a class="post-open" href="${detailUrl}">
        <div class="post-image${resolvedClass}">${photo}${resolvedBanner}<span class="post-type ${post.type}">${boardName(post.type)}</span></div>
        <div class="post-body"><div class="post-title-row"><h3 class="post-title">${escapeHTML(post.item)}</h3><span class="post-date">${formatDate(post.createdAt)}</span></div>
          <p class="post-desc">${escapeHTML(post.simpleDescription)}</p>
          <div class="post-meta"><div class="meta-line"><span>${post.type === 'found' ? '습득' : '분실'} 장소</span><b>${escapeHTML(post.location)}</b></div>${foundMeta}${eventDate}${eventTime}</div>
          <div class="post-author"><span class="author-name"><span class="author-avatar">${escapeHTML((post.nickname || '?').slice(0, 1))}</span>${escapeHTML(post.nickname)}</span>${comments}</div>
        </div>
      </a>
      <div class="post-actions">${resolveAction}<button type="button" data-action="edit" data-id="${escapeHTML(post.id)}">수정</button><button type="button" data-action="delete" data-id="${escapeHTML(post.id)}">삭제</button></div>
    </article>`;
  }).join('');

  const empty = $('#emptyState');
  empty.hidden = shown.length !== 0;
  grid.hidden = shown.length === 0;
  if (shown.length === 0 && normalizedQuery) {
    $('.empty-kicker').textContent = '검색 결과가 없어요';
    $('.empty-state h3').textContent = '다른 검색어를 입력해 보세요.';
    $('.empty-state>p:not(.empty-kicker)').innerHTML = '물품명이나 장소의 일부만 입력해도<br>게시물을 찾을 수 있어요.';
    $('#emptyPost').hidden = true;
  } else {
    $('.empty-kicker').textContent = '아직 게시물이 없어요';
    $('.empty-state h3').textContent = '첫 번째 소식을 남겨 주세요.';
    $('.empty-state>p:not(.empty-kicker)').innerHTML = '분실했거나 주운 물건이 있다면<br>게시판에 올려 함께 찾아봐요.';
    $('#emptyPost').hidden = false;
  }
}
