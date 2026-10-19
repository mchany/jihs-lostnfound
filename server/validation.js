export function validatePost(body, { creating = false } = {}) {
  const type = body.type;
  const item = String(body.item || '').trim();
  const location = String(body.location || '').trim();
  const storage = String(body.storage || '').trim();
  const eventDate = String(body.eventDate || body.foundDate || body.lostDate || '');
  const eventTime = String(body.eventTime || body.foundTime || body.lostTime || '');
  const nickname = String(body.nickname || '').trim();
  const password = String(body.password || '');
  const simpleDescription = String(body.simpleDescription || '').trim();
  const detailedDescription = String(body.detailedDescription || '').trim();

  if (!['lost', 'found'].includes(type)) throw Object.assign(new Error('게시물 종류를 선택해 주세요.'), { status: 400 });
  if (!item || item.length > 60 || !location || location.length > 80 || !nickname || nickname.length > 20) {
    throw Object.assign(new Error('물품명, 장소, 닉네임을 확인해 주세요.'), { status: 400 });
  }
  if (type === 'found' && (!storage || storage.length > 80)) {
    throw Object.assign(new Error('습득물의 보관 장소를 입력해 주세요.'), { status: 400 });
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(foundDate)
    && !Number.isNaN(Date.parse(`${eventDate}T00:00:00Z`))
    && new Date(`${eventDate}T00:00:00Z`).toISOString().slice(0, 10) === eventDate;
  if (!validDate) {
    throw Object.assign(new Error('게시물 날짜를 선택해 주세요.'), { status: 400 });
  }
  if (type === 'found' && foundTime && (!/^\d{2}:\d{2}$/.test(foundTime) || Number(foundTime.slice(0, 2)) > 23 || Number(foundTime.slice(3, 5)) > 59)) {
    throw Object.assign(new Error('게시물 시간을 확인해 주세요.'), { status: 400 });
  }
  if (!simpleDescription || simpleDescription.length > 120) {
    throw Object.assign(new Error('간단 설명을 120자 이내로 입력해 주세요.'), { status: 400 });
  }
  if (detailedDescription.length > 2000) throw Object.assign(new Error('상세 설명은 2,000자까지 입력할 수 있어요.'), { status: 400 });
  if (creating && (password.length < 4 || password.length > 32)) {
    throw Object.assign(new Error('비밀번호는 4자 이상, 32자 이하로 입력해 주세요.'), { status: 400 });
  }
  if (!creating && (password.length < 4 || password.length > 32)) {
    throw Object.assign(new Error('비밀번호를 확인해 주세요.'), { status: 400 });
  }

  return {
    type, item, location, storage: type === 'found' ? storage : '',
    eventDate, eventTime,
    nickname, password, simpleDescription, detailedDescription, photoData: body.photo || ''
  };
}

export function validateCommentCredentials(body) {
  const nickname = String(body.nickname || '').trim();
  const password = String(body.password || '');
  if (!nickname || nickname.length > 20 || password.length < 4 || password.length > 32) {
    throw Object.assign(new Error('닉네임과 비밀번호를 확인해 주세요. 비밀번호는 4자 이상 입력해 주세요.'), { status: 400 });
  }
  return { nickname, password };
}

export function validateComment(body) {
  const { nickname, password } = validateCommentCredentials(body);
  const content = String(body.content || '').trim();
  if (!content || content.length > 500) {
    throw Object.assign(new Error('댓글을 확인해 주세요. 댓글은 500자까지 입력할 수 있어요.'), { status: 400 });
  }
  return { nickname, password, content };
}
