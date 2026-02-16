import { wsClient } from './ws-client.js'
import { renderMarkdown } from './markdown.js'
import { initMedia, pickImage, getAttachments, clearAttachments, hasAttachments, showLightbox } from './media.js'
import { initCommands, showCommands } from './commands.js'

const SESSION_KEY = 'agent:main:main'

let _messagesEl = null
let _typingEl = null
let _textarea = null
let _sendBtn = null
let _previewBar = null
let _isStreaming = false
let _currentAiBubble = null
let _currentAiText = ''
let _currentRunId = null
let _toolCards = new Map()

const SVG_SEND = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>`
const SVG_ATTACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`
const SVG_CMD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>`
const SVG_SETTINGS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`

export function createChatPage() {
  const page = document.createElement('div')
  page.className = 'page chat-page hidden'
  page.id = 'chat-page'

  page.innerHTML = `
    <div class="chat-header">
      <div class="status-dot" id="status-dot"></div>
      <div class="title">OpenClaw Mobile</div>
      <button class="settings-btn" id="settings-btn">${SVG_SETTINGS}</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="typing-indicator" id="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
    <div class="preview-bar" id="preview-bar"></div>
    <div class="chat-input-area">
      <button class="icon-btn" id="cmd-btn">${SVG_CMD}</button>
      <button class="icon-btn" id="attach-btn">${SVG_ATTACH}</button>
      <div class="input-wrapper">
        <textarea id="chat-input" rows="1" placeholder="输入消息..."></textarea>
      </div>
      <button class="send-btn" id="send-btn" disabled>${SVG_SEND}</button>
    </div>
  `

  return page
}

export function initChatUI(onSettings) {
  _messagesEl = document.getElementById('chat-messages')
  _typingEl = document.getElementById('typing-indicator')
  _textarea = document.getElementById('chat-input')
  _sendBtn = document.getElementById('send-btn')
  _previewBar = document.getElementById('preview-bar')

  initMedia(_previewBar, updateSendState)

  document.getElementById('settings-btn').onclick = onSettings
  document.getElementById('cmd-btn').onclick = () => showCommands()
  document.getElementById('attach-btn').onclick = () => pickImage()
  _sendBtn.onclick = () => sendMessage()

  _textarea.addEventListener('input', () => {
    autoResize()
    updateSendState()
  })

  _textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      sendMessage()
    }
  })

  initCommands((cmd, fillOnly) => {
    if (fillOnly) {
      _textarea.value = cmd
      _textarea.focus()
      updateSendState()
    } else {
      _textarea.value = cmd
      sendMessage()
    }
  })

  wsClient.onEvent(handleEvent)

  wsClient.onStatusChange(status => {
    const dot = document.getElementById('status-dot')
    dot.className = 'status-dot'
    if (status === 'connected') dot.classList.add('connected')
    else if (status === 'connecting') dot.classList.add('connecting')
  })

  loadHistory()
}

function autoResize() {
  _textarea.style.height = 'auto'
  _textarea.style.height = Math.min(_textarea.scrollHeight, 120) + 'px'
}

function updateSendState() {
  const hasText = _textarea.value.trim().length > 0
  _sendBtn.disabled = !hasText && !hasAttachments()
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
    await wsClient.chatSend(SESSION_KEY, text, attachments.length ? attachments : undefined)
  } catch (err) {
    showTyping(false)
    appendSystemMessage(`发送失败: ${err.message}`)
  }
}

function handleEvent(msg) {
  const { event, payload } = msg

  if (event === 'chat') {
    handleChatEvent(payload)
  } else if (event === 'agent') {
    handleAgentEvent(payload)
  }
}

function handleChatEvent(payload) {
  const { state, message, errorMessage } = payload

  if (state === 'delta') {
    return
  }

  if (state === 'final') {
    showTyping(false)
    if (_currentAiBubble && _currentAiText) {
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
      bindImageClicks(_currentAiBubble)
    }
    _currentAiBubble = null
    _currentAiText = ''
    _currentRunId = null
    _toolCards.clear()
  }

  if (state === 'aborted') {
    showTyping(false)
    appendSystemMessage('已中止')
    _currentAiBubble = null
    _currentAiText = ''
    _currentRunId = null
  }

  if (state === 'error') {
    showTyping(false)
    appendSystemMessage(`错误: ${errorMessage || '未知错误'}`)
    _currentAiBubble = null
    _currentAiText = ''
    _currentRunId = null
  }
}

function handleAgentEvent(payload) {
  const { runId, stream, data } = payload

  if (stream === 'lifecycle') {
    if (data.state === 'started') {
      _currentRunId = runId
      showTyping(true)
    }
    if (data.state === 'ended') {
      showTyping(false)
    }
    return
  }

  if (stream === 'assistant') {
    showTyping(false)
    if (data.text) {
      if (!_currentAiBubble) {
        _currentAiBubble = createAiBubble()
        _currentAiText = ''
      }
      _currentAiText += data.text
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
      scrollToBottom()
    }
    return
  }

  if (stream === 'tool') {
    const cardKey = `${runId}-${data.name}-${payload.seq}`
    let card = _toolCards.get(cardKey)

    if (!card) {
      card = createToolCard(data.name, data.status || 'running')
      _toolCards.set(cardKey, card)
    } else {
      updateToolCard(card, data.status || 'done')
    }
    scrollToBottom()
  }
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
  card.innerHTML = `
    <div class="tool-name">🔧 ${escapeText(name)}</div>
    <div class="tool-status ${status === 'running' ? 'running' : 'done'}">${statusText(status)}</div>
  `
  wrapper.appendChild(card)
  _messagesEl.insertBefore(wrapper, _typingEl)
  return card
}

function updateToolCard(card, status) {
  const statusEl = card.querySelector('.tool-status')
  if (statusEl) {
    statusEl.className = `tool-status ${status === 'running' ? 'running' : 'done'}`
    statusEl.textContent = statusText(status)
  }
}

function statusText(s) {
  const map = { running: '执行中...', done: '已完成', error: '失败' }
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
      html += `<br><img src="${att.data}" alt="${escapeText(att.name)}" class="msg-img" />`
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
  _isStreaming = show
  _typingEl.classList.toggle('visible', show)
  if (show) scrollToBottom()
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    _messagesEl.scrollTop = _messagesEl.scrollHeight
  })
}

function bindImageClicks(container) {
  container.querySelectorAll('img').forEach(img => {
    img.onclick = () => showLightbox(img.src)
  })
}

function escapeText(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function loadHistory() {
  try {
    const result = await wsClient.chatHistory(SESSION_KEY, 50)
    if (result?.messages?.length) {
      result.messages.forEach(msg => {
        if (msg.role === 'user') {
          appendUserMessage(msg.content || msg.text || '')
        } else if (msg.role === 'assistant') {
          appendAiMessage(msg.content || msg.text || '')
        }
      })
    }
  } catch {}
}

export function abortChat() {
  wsClient.chatAbort(SESSION_KEY).catch(() => {})
}
