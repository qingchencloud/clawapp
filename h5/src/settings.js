/**
 * 设置面板 - 主题/语言/连接管理
 */

import { getTheme, setTheme } from './theme.js'
import { getLang, setLang, t, onLangChange } from './i18n.js'

const LAYOUT_KEY = 'clawapp-layout'

let _onDisconnect = null

function getLayout() {
  return localStorage.getItem(LAYOUT_KEY) || 'auto'
}

function setLayout(value) {
  localStorage.setItem(LAYOUT_KEY, value)
  if (value === 'auto') delete document.documentElement.dataset.layout
  else document.documentElement.dataset.layout = value
}

export function initSettings(onDisconnect) {
  _onDisconnect = onDisconnect
  // 启动时恢复布局
  const saved = getLayout()
  if (saved !== 'auto') document.documentElement.dataset.layout = saved
}

export function showSettings() {
  document.querySelector('.settings-overlay')?.remove()
  document.querySelector('.settings-panel')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'settings-overlay cmd-overlay visible'
  overlay.onclick = () => closeSettings()

  const panel = document.createElement('div')
  panel.className = 'settings-panel cmd-panel visible'

  const currentTheme = getTheme()
  const currentLang = getLang()
  const currentLayout = getLayout()

  panel.innerHTML = `
    <div class="cmd-panel-header">
      <h3>${t('settings.title')}</h3>
      <button class="close-btn">×</button>
    </div>
    <div class="settings-content cmd-list">
      <div class="settings-section">
        <div class="settings-label">${t('settings.theme')}</div>
        <div class="settings-toggle-group" id="theme-toggle">
          <button class="settings-toggle ${currentTheme === 'light' ? 'active' : ''}" data-value="light">
            ☀️ ${t('settings.theme.light')}
          </button>
          <button class="settings-toggle ${currentTheme === 'dark' ? 'active' : ''}" data-value="dark">
            🌙 ${t('settings.theme.dark')}
          </button>
          <button class="settings-toggle ${currentTheme === 'auto' ? 'active' : ''}" data-value="auto">
            🔄 ${t('settings.theme.auto')}
          </button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">${t('settings.lang')}</div>
        <div class="settings-toggle-group" id="lang-toggle">
          <button class="settings-toggle ${currentLang === 'zh-CN' ? 'active' : ''}" data-value="zh-CN">
            中文
          </button>
          <button class="settings-toggle ${currentLang === 'en' ? 'active' : ''}" data-value="en">
            English
          </button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">${t('settings.layout')}</div>
        <div class="settings-toggle-group" id="layout-toggle">
          <button class="settings-toggle ${currentLayout === 'compact' ? 'active' : ''}" data-value="compact">
            ${t('settings.layout.compact')}
          </button>
          <button class="settings-toggle ${currentLayout === 'auto' ? 'active' : ''}" data-value="auto">
            ${t('settings.layout.auto')}
          </button>
          <button class="settings-toggle ${currentLayout === 'wide' ? 'active' : ''}" data-value="wide">
            ${t('settings.layout.wide')}
          </button>
        </div>
      </div>

      <div class="settings-section" style="margin-top:16px">
        <button class="settings-disconnect-btn" id="settings-disconnect">
          ${t('settings.disconnect')}
        </button>
      </div>

      <div class="settings-about">
        <div class="settings-about-header">
          <span class="settings-about-logo">🐾</span>
          <div>
            <div class="settings-about-name">ClawApp</div>
            <div class="settings-about-ver">${t('about.version')} 1.2.0</div>
          </div>
        </div>
        <div class="settings-about-links">
          <a href="https://clawapp.qt.cool" target="_blank" rel="noopener">${t('about.homepage')}</a>
          <a href="https://github.com/qingchencloud/clawapp" target="_blank" rel="noopener">${t('about.github')}</a>
          <a href="https://cftunnel.qt.cool" target="_blank" rel="noopener">${t('about.cftunnel')}</a>
          <a href="https://github.com/qingchencloud/clawapp/releases" target="_blank" rel="noopener">${t('about.community')}</a>
        </div>
        <div class="settings-about-footer">
          MIT ${t('about.license')} · ${t('about.copyright')}
        </div>
      </div>
    </div>
  `

  panel.querySelector('.close-btn').onclick = () => closeSettings()

  // 主题切换
  panel.querySelectorAll('#theme-toggle .settings-toggle').forEach(btn => {
    btn.onclick = () => {
      const value = btn.dataset.value
      setTheme(value)
      panel.querySelectorAll('#theme-toggle .settings-toggle').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    }
  })

  // 语言切换
  panel.querySelectorAll('#lang-toggle .settings-toggle').forEach(btn => {
    btn.onclick = () => {
      const value = btn.dataset.value
      setLang(value)
      panel.querySelectorAll('#lang-toggle .settings-toggle').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      // 语言切换后重建面板
      closeSettings()
      showSettings()
    }
  })

  // 布局切换
  panel.querySelectorAll('#layout-toggle .settings-toggle').forEach(btn => {
    btn.onclick = () => {
      setLayout(btn.dataset.value)
      panel.querySelectorAll('#layout-toggle .settings-toggle').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    }
  })

  // 断开连接
  panel.querySelector('#settings-disconnect').onclick = () => {
    closeSettings()
    _onDisconnect?.()
  }

  document.body.appendChild(overlay)
  document.body.appendChild(panel)
}

function closeSettings() {
  document.querySelector('.settings-overlay')?.remove()
  document.querySelector('.settings-panel')?.remove()
}
