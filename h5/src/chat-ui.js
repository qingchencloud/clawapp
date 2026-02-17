import { wsClient } from './ws-client.js'
import { renderMarkdown } from './markdown.js'
import { initMedia, pickImage, getAttachments, clearAttachments, hasAttachments, showLightbox } from './media.js'
import { initCommands, showCommands } from './commands.js'
import { t, formatRelativeTime } from './i18n.js'
import { initSettings, showSettings } from './settings.js'

let _messagesEl = null
let _typingEl = null
let _textarea = null
let _sendBtn = null
let _previewBar = null
let _sessionKey = ''
let _isStreaming = false
let _currentAiBubble = null
let _currentAiText = ''
let _currentRunId = null
let _toolCards = new Map()
let _onSettingsCallback = null
let _renderTimer = null    // 节流渲染定时器
const RENDER_THROTTLE = 50 // 渲染节流间隔 ms

const SVG_SEND = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>`
const SVG_ATTACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`
const SVG_CMD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>`
const SVG_SETTINGS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
const SVG_STOP = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`

/** 从 OpenClaw 消息对象中提取纯文本 */
function extractText(message) {
  if (!message || typeof message !== 'object') return null
  const content = message.content
  if (typeof content === 'string') return stripThinkingTags(content)
  if (Array.isArray(content)) {
    const parts = content
      .filter(p => p.type === 'text' && typeof p.text === 'string')
      .map(p => p.text)
    if (parts.length > 0) return stripThinkingTags(parts.join('\n'))
  }
  if (typeof message.text === 'string') return stripThinkingTags(message.text)
  return null
}

function stripThinkingTags(text) {
  return text.replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, '').trim()
}

export function createChatPage() {
  const page = document.createElement('div')
  page.className = 'page chat-page hidden'
  page.id = 'chat-page'
  page.innerHTML = `
    <div class="chat-header">
      <div class="status-dot" id="status-dot"></div>
      <div class="title" id="session-title">OpenClaw Mobile</div>
      <button class="settings-btn" id="settings-btn">${SVG_SETTINGS}</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="typing-indicator" id="typing-indicator"><span></span><span></span><span></span></div>
    </div>
    <div class="preview-bar" id="preview-bar"></div>
    <div class="chat-input-area">
      <button class="icon-btn" id="cmd-btn">${SVG_CMD}</button>
      <button class="icon-btn" id="attach-btn">${SVG_ATTACH}</button>
      <div class="input-wrapper"><textarea id="chat-input" rows="1" placeholder="${t('chat.input.placeholder')}"></textarea></div>
      <button class="send-btn" id="send-btn" disabled>${SVG_SEND}</button>
    </div>
  `
  return page
}

export function setSessionKey(key) { _sessionKey = key; updateSessionTitle() }
export function getSessionKey() { return _sessionKey }

export function initChatUI(onSettings) {
  _messagesEl = document.getElementById('chat-messages')
  _typingEl = document.getElementById('typing-indicator')
  _textarea = document.getElementById('chat-input')
  _sendBtn = document.getElementById('send-btn')
  _previewBar = document.getElementById('preview-bar')
  _onSettingsCallback = onSettings

  initMedia(_previewBar, updateSendState)
  initSettings(onSettings)

  document.getElementById('settings-btn').onclick = () => showSettings()
  document.getElementById('session-title').onclick = () => showSessionPicker()
  document.getElementById('cmd-btn').onclick = () => showCommands()
  document.getElementById('attach-btn').onclick = () => pickImage()
  _sendBtn.onclick = () => handleSendClick()

  _textarea.addEventListener('input', () => { autoResize(); updateSendState() })
  _textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSendClick() }
  })

  initCommands((cmd, fillOnly) => {
    if (fillOnly) { _textarea.value = cmd; _textarea.focus(); updateSendState() }
    else { _textarea.value = cmd; sendMessage() }
  })

  wsClient.onEvent(handleEvent)
  wsClient.onStatusChange(status => {
    const dot = document.getElementById('status-dot')
    dot.className = 'status-dot'
    if (status === 'ready' || status === 'connected') dot.classList.add('connected')
    else if (status === 'connecting' || status === 'reconnecting') dot.classList.add('connecting')
  })
}

function autoResize() {
  _textarea.style.height = 'auto'
  _textarea.style.height = Math.min(_textarea.scrollHeight, 120) + 'px'
}

function updateSendState() {
  const hasText = _textarea.value.trim().length > 0
  _sendBtn.disabled = !hasText && !hasAttachments()
  // 流式响应中显示停止按钮
  if (_isStreaming) {
    _sendBtn.innerHTML = SVG_STOP
    _sendBtn.disabled = false
    _sendBtn.classList.add('stop-mode')
  } else {
    _sendBtn.innerHTML = SVG_SEND
    _sendBtn.classList.remove('stop-mode')
  }
}

function handleSendClick() {
  if (_isStreaming) {
    wsClient.chatAbort(_sessionKey, _currentRunId).catch(() => {})
    return
  }
  sendMessage()
}

async function sendMessage() {
  const text = _textarea.value.trim()
  if (!text && !hasAttachments()) return

  const attachments = getAttachments()
  if (text) appendUserMessage(text, attachments)
  _textarea.value = ''
  _textarea.style.height = 'auto'
  clearAttachments()
  updateSendState()
  showTyping(true)

  try {
    await wsClient.chatSend(_sessionKey, text, attachments.length ? attachments : undefined)
  } catch (err) {
    showTyping(false)
    if (err.message.includes('未连接') || err.message.includes('超时') || err.message.includes('重连') || err.message.includes('timeout') || err.message.includes('reconnect')) {
      appendSystemMessage(t('chat.reconnecting'))
    } else {
      appendSystemMessage(`${t('chat.send.error')}: ${err.message}`)
    }
  }
}

function handleEvent(msg) {
  const { event, payload } = msg
  if (event === 'chat') handleChatEvent(payload)
  else if (event === 'agent') handleAgentEvent(payload)
}

function handleChatEvent(payload) {
  if (!payload) return
  if (payload.sessionKey && payload.sessionKey !== _sessionKey) return

  const { state } = payload

  if (state === 'delta') {
    const text = extractText(payload.message)
    if (text && text.length > _currentAiText.length) {
      showTyping(false)
      if (!_currentAiBubble) { _currentAiBubble = createAiBubble(); _currentRunId = payload.runId }
      _currentAiText = text
      throttledRender()
    }
    return
  }

  if (state === 'final') {
    showTyping(false)
    if (_currentAiBubble && _currentAiText) {
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
      bindImageClicks(_currentAiBubble)
    }
    resetStreamState()
    // 与 control-ui 一致：final 后重新加载历史获取完整消息
    loadHistory()
    return
  }

  if (state === 'aborted') {
    showTyping(false)
    if (_currentAiText.trim()) {
      if (_currentAiBubble) {
        _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
        bindImageClicks(_currentAiBubble)
      }
    }
    appendSystemMessage(t('chat.aborted'))
    resetStreamState()
    return
  }

  if (state === 'error') {
    showTyping(false)
    appendSystemMessage(`错误: ${payload.errorMessage || '未知错误'}`)
    resetStreamState()
    return
  }
}

function handleAgentEvent(payload) {
  if (!payload) return
  // 过滤非当前会话的事件
  if (payload.sessionKey && payload.sessionKey !== _sessionKey) return
  const { runId, stream, data } = payload

  if (stream === 'lifecycle') {
    if (data?.state === 'started') { _currentRunId = runId; showTyping(true); _isStreaming = true; updateSendState() }
    if (data?.state === 'ended') { showTyping(false); _isStreaming = false; updateSendState() }
    return
  }

  // agent assistant 事件 — 不再处理文本，完全依赖 chat delta
  // 只保留 lifecycle 和 tool 事件
  if (stream === 'assistant') {
    // 忽略文本增量，chat delta 已经提供累积文本
    return
  }

  // tool 事件用 toolCallId + phase 跟踪
  if (stream === 'tool') {
    const toolCallId = data?.toolCallId
    if (!toolCallId) return
    const name = data.name || 'tool'
    const phase = data.phase || ''

    let card = _toolCards.get(toolCallId)
    if (!card) {
      card = createToolCard(name, phase === 'start' ? 'running' : 'done')
      _toolCards.set(toolCallId, card)
    }
    if (phase === 'result' || phase === 'error') {
      updateToolCard(card, phase === 'error' ? 'error' : 'done')
    } else if (phase === 'update') {
      updateToolCard(card, 'running')
    }
    scrollToBottom()
    return
  }
}

function resetStreamState() {
  // 最后一次渲染确保完整
  if (_currentAiBubble && _currentAiText) {
    _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
    bindImageClicks(_currentAiBubble)
    scrollToBottom()
  }
  if (_renderTimer) { clearTimeout(_renderTimer); _renderTimer = null }
  _currentAiBubble = null
  _currentAiText = ''
  _currentRunId = null
  _isStreaming = false
  _toolCards.clear()
  updateSendState()
}

/** 节流渲染：避免高频 delta 导致疯狂重绘 */
function throttledRender() {
  if (_renderTimer) return  // 已有待执行的渲染，跳过
  _renderTimer = setTimeout(() => {
    _renderTimer = null
    if (_currentAiBubble && _currentAiText) {
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
      scrollToBottom()
    }
  }, RENDER_THROTTLE)
}

function createAiBubble() {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg ai'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  wrapper.appendChild(bubble)
  _messagesEl.insertBefore(wrapper, _typingEl)
  scrollToBottom()
  return bubble
}

function createToolCard(name, status) {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg ai'
  const card = document.createElement('div')
  card.className = 'tool-card'
  card.innerHTML = `<div class="tool-name">🔧 ${escapeText(name)}</div><div class="tool-status ${status === 'running' ? 'running' : 'done'}">${statusText(status)}</div>`
  wrapper.appendChild(card)
  _messagesEl.insertBefore(wrapper, _typingEl)
  return card
}

function updateToolCard(card, status) {
  const statusEl = card.querySelector('.tool-status')
  if (statusEl) {
    statusEl.className = `tool-status ${status === 'running' ? 'running' : status === 'error' ? 'error' : 'done'}`
    statusEl.textContent = statusText(status)
  }
}

function statusText(s) {
  const map = { running: t('tool.running'), done: t('tool.done'), error: t('tool.error') }
  return map[s] || s
}

function appendUserMessage(text, attachments) {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg user'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  let html = escapeText(text).replace(/\n/g, '<br>')
  if (attachments?.length) {
    attachments.forEach(att => {
      const src = att.data || (att.content ? `data:${att.mimeType};base64,${att.content}` : '')
      if (src) html += `<br><img src="${src}" alt="attachment" class="msg-img" />`
    })
  }
  bubble.innerHTML = html
  bindImageClicks(bubble)
  wrapper.appendChild(bubble)
  _messagesEl.insertBefore(wrapper, _typingEl)
  scrollToBottom()
}

function appendAiMessage(text) {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg ai'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  bubble.innerHTML = renderMarkdown(text)
  bindImageClicks(bubble)
  wrapper.appendChild(bubble)
  _messagesEl.insertBefore(wrapper, _typingEl)
  scrollToBottom()
}

function appendSystemMessage(text) {
  const el = document.createElement('div')
  el.className = 'system-msg'
  el.textContent = text
  _messagesEl.insertBefore(el, _typingEl)
  scrollToBottom()
}

function showTyping(show) {
  _typingEl.classList.toggle('visible', show)
  if (show) scrollToBottom()
}

function scrollToBottom() {
  requestAnimationFrame(() => { _messagesEl.scrollTop = _messagesEl.scrollHeight })
}

function bindImageClicks(container) {
  container.querySelectorAll('img').forEach(img => { img.onclick = () => showLightbox(img.src) })
}

function escapeText(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export async function loadHistory() {
  if (!_sessionKey || !wsClient.gatewayReady) return
  try {
    const result = await wsClient.chatHistory(_sessionKey, 200)
    // 先清空旧消息（不管新历史是否为空）
    clearMessages()
    if (!result?.messages?.length) {
      appendSystemMessage(t('chat.no.messages'))
      return
    }
    // 渲染历史消息
    result.messages.forEach(msg => {
      const text = extractText(msg)
      if (!text) return
      if (msg.role === 'user') appendUserMessage(text)
      else if (msg.role === 'assistant') appendAiMessage(text)
    })
    scrollToBottom()
  } catch (e) {
    console.error('[chat] loadHistory error:', e)
    appendSystemMessage(`${t('chat.load.error')}: ${e.message}`)
  }
}

/** 清空消息区域（保留 typing indicator） */
function clearMessages() {
  if (!_messagesEl) return
  const children = Array.from(_messagesEl.children)
  children.forEach(child => { if (child !== _typingEl) _messagesEl.removeChild(child) })
}

export function abortChat() {
  wsClient.chatAbort(_sessionKey, _currentRunId).catch(() => {})
}

/** 更新标题栏显示当前会话名 */
function updateSessionTitle() {
  const titleEl = document.getElementById('session-title')
  if (!titleEl) return
  // 从 sessionKey 提取可读名称
  // 格式: agent:main:main 或 agent:main:qqbot:dm:xxx
  const parts = _sessionKey.split(':')
  let label = 'OpenClaw Mobile'
  if (parts.length >= 3) {
    const agent = parts[1]
    const channel = parts.slice(2).join(':')
    if (channel === 'main') label = t('session.main')
    else label = channel.length > 20 ? channel.substring(0, 20) + '…' : channel
  }
  titleEl.textContent = label
  titleEl.title = _sessionKey
}

/** 会话选择面板 */
async function showSessionPicker() {
  // 移除已有面板
  document.querySelector('.session-overlay')?.remove()
  document.querySelector('.session-panel')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'session-overlay cmd-overlay visible'
  overlay.onclick = () => closeSessionPicker()

  const panel = document.createElement('div')
  panel.className = 'session-panel cmd-panel visible'
  panel.innerHTML = `
    <div class="cmd-panel-header">
      <h3>${t('session.title')}</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="session-action-btn" id="session-new-btn" title="新建会话">＋</button>
        <button class="close-btn">×</button>
      </div>
    </div>
    <div class="session-list cmd-list">
      <div class="session-loading">加载中...</div>
    </div>
  `
  panel.querySelector('.close-btn').onclick = () => closeSessionPicker()
  panel.querySelector('#session-new-btn').onclick = () => promptNewSession()

  document.body.appendChild(overlay)
  document.body.appendChild(panel)

  await refreshSessionList()
}

/** 刷新会话列表 */
async function refreshSessionList() {
  const listEl = document.querySelector('.session-list')
  if (!listEl) return
  listEl.innerHTML = '<div class="session-loading">' + t('session.loading') + '</div>'

  try {
    const result = await wsClient.sessionsList(50)
    const sessions = result?.sessions || result || []
    listEl.innerHTML = ''

    if (!sessions.length) {
      listEl.innerHTML = '<div class="session-loading">' + t('session.empty') + '</div>'
      return
    }

    sessions.forEach(s => {
      const key = s.sessionKey || s.key || ''
      const isActive = key === _sessionKey
      const item = document.createElement('div')
      item.className = `cmd-item${isActive ? ' session-active' : ''}`

      // 解析会话信息
      const parts = key.split(':')
      let name = key
      let detail = ''
      if (parts.length >= 3) {
        const agent = parts[1]
        const channel = parts.slice(2).join(':')
        name = channel === 'main' ? `${t('session.main')} (${agent})` : channel
        detail = agent !== 'main' ? `agent: ${agent}` : ''
      }

      // 最后活跃时间
      const updated = s.updatedAt || s.lastActivity
      const timeStr = formatRelativeTime(updated)

      item.innerHTML = `
        <div class="session-item-content" style="flex:1;min-width:0">
          <div class="cmd-text" style="font-family:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeText(name)}</div>
          ${detail ? `<div class="cmd-desc">${escapeText(detail)}</div>` : ''}
        </div>
        ${timeStr ? `<div class="cmd-desc" style="flex-shrink:0">${timeStr}</div>` : ''}
        ${isActive ? '<div style="color:var(--success);flex-shrink:0">●</div>' : ''}
        <button class="session-delete-btn" title="删除会话">✕</button>
      `

      // 点击切换会话
      item.querySelector('.session-item-content').onclick = () => {
        if (key === _sessionKey) { closeSessionPicker(); return }
        switchSession(key)
        closeSessionPicker()
      }

      // 删除按钮
      item.querySelector('.session-delete-btn').onclick = (e) => {
        e.stopPropagation()
        confirmDeleteSession(key, name)
      }

      listEl.appendChild(item)
    })
  } catch (e) {
    listEl.innerHTML = `<div class="session-loading" style="color:var(--danger)">${t('session.load.error')}: ${escapeText(e.message)}</div>`
  }
}

/** 新建会话弹窗 */
function promptNewSession() {
  closeSessionPicker()

  const overlay = document.createElement('div')
  overlay.className = 'session-overlay cmd-overlay visible'

  const dialog = document.createElement('div')
  dialog.className = 'session-dialog'
  dialog.innerHTML = `
    <h3>${t('session.new')}</h3>
    <div class="form-group" style="margin:16px 0">
      <label style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;display:block">${t('session.new.name')}</label>
      <input type="text" id="new-session-name" placeholder="${t('session.new.name.placeholder')}" 
        style="width:100%;height:40px;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:0 12px;color:var(--text-primary);font-size:14px;outline:none" />
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
        ${t('session.new.hint')}
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="session-dialog-btn cancel">${t('cancel')}</button>
      <button class="session-dialog-btn confirm">${t('session.new.create')}</button>
    </div>
  `

  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); dialog.remove() } }
  dialog.querySelector('.cancel').onclick = () => { overlay.remove(); dialog.remove() }
  dialog.querySelector('.confirm').onclick = () => {
    const name = dialog.querySelector('#new-session-name').value.trim()
    if (!name) return
    const newKey = `agent:main:${name}`
    overlay.remove()
    dialog.remove()
    switchSession(newKey)
    appendSystemMessage(t('session.created', { name }))
  }

  document.body.appendChild(overlay)
  document.body.appendChild(dialog)
  dialog.querySelector('#new-session-name').focus()
  dialog.querySelector('#new-session-name').onkeydown = (e) => {
    if (e.key === 'Enter') dialog.querySelector('.confirm').click()
  }
}

/** 确认删除会话 */
function confirmDeleteSession(key, name) {
  const overlay = document.createElement('div')
  overlay.className = 'session-overlay cmd-overlay visible'

  const dialog = document.createElement('div')
  dialog.className = 'session-dialog'
  dialog.innerHTML = `
    <h3>${t('session.delete')}</h3>
    <p style="color:var(--text-secondary);font-size:14px;margin:12px 0">
      ${t('session.delete.confirm', { name: escapeText(name) })}<br>${t('session.delete.warning')}
    </p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="session-dialog-btn cancel">${t('cancel')}</button>
      <button class="session-dialog-btn danger">${t('session.delete.btn')}</button>
    </div>
  `

  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); dialog.remove() } }
  dialog.querySelector('.cancel').onclick = () => { overlay.remove(); dialog.remove() }
  dialog.querySelector('.danger').onclick = async () => {
    overlay.remove()
    dialog.remove()
    try {
      await wsClient.sessionsDelete(key)
      // 如果删的是当前会话，切回主会话
      if (key === _sessionKey) {
        const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
        switchSession(mainKey)
      }
      await refreshSessionList()
    } catch (e) {
      appendSystemMessage(`${t('session.delete.fail')}: ${e.message}`)
    }
  }

  document.body.appendChild(overlay)
  document.body.appendChild(dialog)
}

function closeSessionPicker() {
  document.querySelector('.session-overlay')?.remove()
  document.querySelector('.session-panel')?.remove()
}

/** 切换到指定会话 */
function switchSession(newKey) {
  _sessionKey = newKey
  resetStreamState()
  updateSessionTitle()
  loadHistory()
}
