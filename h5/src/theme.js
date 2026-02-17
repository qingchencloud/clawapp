/**
 * 主题管理 - 亮色/暗色/跟随系统
 */

const THEME_KEY = 'clawapp-theme'

let _currentTheme = 'auto' // 'light' | 'dark' | 'auto'
let _onThemeChange = []
let _mediaQuery = null

/** 初始化主题 */
export function initTheme() {
  _currentTheme = localStorage.getItem(THEME_KEY) || 'auto'
  _mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  _mediaQuery.addEventListener('change', () => {
    if (_currentTheme === 'auto') applyTheme()
  })
  applyTheme()
}

/** 获取当前主题设置 */
export function getTheme() {
  return _currentTheme
}

/** 获取实际生效的主题 */
export function getEffectiveTheme() {
  if (_currentTheme === 'auto') {
    return _mediaQuery?.matches ? 'dark' : 'light'
  }
  return _currentTheme
}

/** 设置主题 */
export function setTheme(theme) {
  if (!['light', 'dark', 'auto'].includes(theme)) return
  _currentTheme = theme
  localStorage.setItem(THEME_KEY, theme)
  applyTheme()
  _onThemeChange.forEach(fn => { try { fn(theme) } catch (e) { console.error(e) } })
}

/** 应用主题到 DOM */
function applyTheme() {
  const effective = getEffectiveTheme()
  document.documentElement.setAttribute('data-theme', effective)
  // 更新 meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.content = effective === 'light' ? '#f5f5f7' : '#1a1a2e'
  }
}

/** 监听主题变化 */
export function onThemeChange(fn) {
  _onThemeChange.push(fn)
  return () => { _onThemeChange = _onThemeChange.filter(cb => cb !== fn) }
}
