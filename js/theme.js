const STORAGE_KEY = 'jungil-theme';
const toggle = document.querySelector('#themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  toggle.setAttribute('aria-pressed', String(isDark));
  toggle.setAttribute('aria-label', isDark ? '라이트 모드 켜기' : '다크 모드 켜기');
  toggle.querySelector('.theme-icon').textContent = isDark ? '☀' : '☾';
  toggle.querySelector('.theme-label').textContent = isDark ? '라이트 모드' : '다크 모드';
  themeColor.content = isDark ? '#171b18' : '#f7f5ef';
}

applyTheme(document.documentElement.dataset.theme || 'light');
toggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(STORAGE_KEY, nextTheme); } catch { /* Theme still works for this page when storage is unavailable. */ }
  applyTheme(nextTheme);
});
