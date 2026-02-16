import './style.css'
import { wsClient } from './ws-client.js'
import { createChatPage, initChatUI } from './chat-ui.js'

const STORAGE_KEY = 'openclaw-config'

const app = document.getElementById('app')

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null
  } catch { return null }
}

function saveConfig(host, token) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ host, token }))
}

function createSetupPage() {
  const page = document.createElement('div')
  page.className = 'page setup-page'
  page.id = 'setup-page'

  const defaultHost = location.hostname
    ? `${location.hostname}:3210`
    : 'localhost:3210'

  page.innerHTML = `
    <div class="setup-card">
      <div class="setup-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#e94560"/>
              <stop offset="100%" stop-color="#0f3460"/>
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="#1a1a2e"/>
          <path d="M32 12C20.954 12 12 20.954 12 32s8.954 20 20 20c2.5 0 4.9-.46 7.1-1.3L48 54l-1.3-8.9A19.9 19.9 0 0052 32c0-11.046-8.954-20-20-20z" stroke="url(#sg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="24" cy="32" r="3" fill="#e94560"/>
          <circle cx="32" cy="32" r="3" fill="#e94560"/>
          <circle cx="40" cy="32" r="3" fill="#e94560"/>
        </svg>
        <h1>OpenClaw Mobile</h1>
        <p>连接到你的 OpenClaw 智能体</p>
      </div>
      <div class="form-group">
        <label>服务器地址</label>
        <input type="text" id="input-host" placeholder="${defaultHost}" value="${defaultHost}" />
      </div>
      <div class="form-group">
        <label>Token</label>
        <input type="password" id="input-token" placeholder="输入访问令牌" />
      </div>
      <button class="btn-primary" id="connect-btn">连接</button>
      <div class="setup-error" id="setup-error"></div>
    </div>
  `

  return page
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('hidden', p.id !== pageId)
  })
}

let chatInitialized = false

function initApp() {
  const setupPage = createSetupPage()
  const chatPage = createChatPage()

  app.appendChild(setupPage)
  app.appendChild(chatPage)

  const config = getConfig()

  const connectBtn = document.getElementById('connect-btn')
  const hostInput = document.getElementById('input-host')
  const tokenInput = document.getElementById('input-token')
  const errorEl = document.getElementById('setup-error')

  if (config) {
    hostInput.value = config.host
    tokenInput.value = config.token
  }

  connectBtn.onclick = () => {
    const host = hostInput.value.trim()
    const token = tokenInput.value.trim()

    if (!host) {
      errorEl.textContent = '请输入服务器地址'
      return
    }
    if (!token) {
      errorEl.textContent = '请输入 Token'
      return
    }

    errorEl.textContent = ''
    connectBtn.disabled = true
    connectBtn.textContent = '连接中...'

    doConnect(host, token, errorEl, connectBtn)
  }

  tokenInput.onkeydown = (e) => {
    if (e.key === 'Enter') connectBtn.click()
  }

  if (config?.host && config?.token) {
    connectBtn.disabled = true
    connectBtn.textContent = '连接中...'
    doConnect(config.host, config.token, errorEl, connectBtn)
  }
}

function doConnect(host, token, errorEl, connectBtn) {
  wsClient.disconnect()

  let resolved = false
  const timeout = setTimeout(() => {
    if (resolved) return
    resolved = true
    errorEl.textContent = '连接超时，请检查地址和网络'
    connectBtn.disabled = false
    connectBtn.textContent = '连接'
  }, 8000)

  wsClient.onStatusChange((status) => {
    if (resolved) return

    if (status === 'connected') {
      resolved = true
      clearTimeout(timeout)
      saveConfig(host, token)
      connectBtn.disabled = false
      connectBtn.textContent = '连接'
      showPage('chat-page')
      if (!chatInitialized) {
        chatInitialized = true
        initChatUI(() => showPage('setup-page'))
      }
    }
  })

  wsClient.connect(host, token)
}

initApp()
