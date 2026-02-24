import { wsClient, uuid } from './api-client.js'
import { renderMarkdown } from './markdown.js'
import { initMedia, pickImage, getAttachments, clearAttachments, hasAttachments, showLightbox } from './media.js'
import { initCommands, showCommands } from './commands.js'
import { t, formatRelativeTime } from './i18n.js'
import { initSettings, showSettings } from './settings.js'
import { saveMessage, saveMessages, getLocalMessages, clearSessionMessages, isStorageAvailable, saveSessionInfo } from './message-db.js'

const STORAGE_SESSION_KEY = 'clawapp-session-key'

let _messagesEl = null
let _typingEl = null
let _textarea = null
let _sendBtn = null
let _previewBar = null
let _sessionKey = ''
let _isStreaming = false
let _isSending = false     // chat.send 请求中
let _messageQueue = []     // 消息队列（发送中时排队）
let _currentAiBubble = null
let _currentAiText = ''
let _currentAiImages = []
let _currentRunId = null
let _lastHistoryHash = ''  // 防止重连时重复渲染
let _toolCards = new Map()
let _onSettingsCallback = null
let _streamSafetyTimer = null // 流式安全超时
let _renderTimer = null    // 节流渲染定时器
let _renderPending = false // 是否有待渲染
const RENDER_THROTTLE = 30 // 渲染节流间隔 ms

const SVG_SEND = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>`
const SVG_ATTACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`
const SVG_CMD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>`
const SVG_SETTINGS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
const SVG_STOP = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`
const SVG_MIC = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`

let _recognition = null
let _isRecording = false

/** 从 OpenClaw 消息中提取可渲染内容（文本 + 图片） */
function extractContent(message) {
  if (!message || typeof message !== 'object') return null
  const content = message.content
  if (typeof content === 'string') return { text: stripThinkingTags(content), images: [] }
  if (Array.isArray(content)) {
    const texts = [], images = []
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      else if (block.type === 'image' && block.data && !block.omitted) {
        images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
      }
    }
    const text = texts.length ? stripThinkingTags(texts.join('\n')) : ''
    if (text || images.length) return { text, images }
  }
  if (typeof message.text === 'string') return { text: stripThinkingTags(message.text), images: [] }
  return null
}

function stripThinkingTags(text) {
  return text
    .replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, '')
    // 过滤 OpenClaw 注入的元数据（Conversation info / Inbound Context）
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '')
    .replace(/\[Queued messages while agent was busy\]\s*---\s*Queued #\d+\s*/gi, '')
    .trim()
}

export function createChatPage() {
  const page = document.createElement('div')
  page.className = 'page chat-page hidden'
  page.id = 'chat-page'
  page.innerHTML = `
    <div class="chat-header">
      <div class="status-dot" id="status-dot"></div>
      <div class="title" id="session-title">ClawApp</div>
      <button class="settings-btn" id="settings-btn">${SVG_SETTINGS}</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="typing-indicator" id="typing-indicator"><span></span><span></span><span></span></div>
    </div>
    <button class="scroll-bottom-btn" id="scroll-bottom-btn">↓</button>
    <div class="preview-bar" id="preview-bar"></div>
    <div class="chat-input-area">
      <button class="icon-btn" id="cmd-btn">${SVG_CMD}</button>
      <button class="icon-btn" id="attach-btn">${SVG_ATTACH}</button>
      <button class="icon-btn" id="mic-btn" style="display:none">${SVG_MIC}</button>
      <div class="input-wrapper"><textarea id="chat-input" rows="1" placeholder="${t('chat.input.placeholder')}"></textarea></div>
      <button class="send-btn" id="send-btn" disabled>${SVG_SEND}</button>
    </div>
  `
  return page
}

export function setSessionKey(key) {
  // 优先恢复上次使用的会话
  const saved = localStorage.getItem(STORAGE_SESSION_KEY)
  if (saved && saved !== key) {
    _sessionKey = saved
  } else {
    _sessionKey = key
  }
  updateSessionTitle()
}
export function getSessionKey() { return _sessionKey }

export function initChatUI(onSettings) {
  _messagesEl = document.getElementById('chat-messages')
  _typingEl = document.getElementById('typing-indicator')
  
  // 滚动到底部按钮
  const scrollBtn = document.getElementById('scroll-bottom-btn')
  scrollBtn.onclick = () => scrollToBottom()
  _messagesEl.onscroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = _messagesEl
    scrollBtn.classList.toggle('visible', scrollHeight - scrollTop - clientHeight > 200)
  }
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

  // 语音输入
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const micBtn = document.getElementById('mic-btn')
  if (SpeechRecognition && micBtn) {
    micBtn.style.display = ''
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    micBtn.onclick = () => isSecure ? toggleVoiceInput(SpeechRecognition) : appendSystemMessage(t('voice.need.https'))
  }

  initCommands((cmd, fillOnly) => {
    if (fillOnly) { _textarea.value = cmd; _textarea.focus(); updateSendState() }
    else { _textarea.value = cmd; sendMessage() }
  })

  wsClient.onEvent(handleEvent)
  wsClient.onStatusChange(status => {
    const dot = document.getElementById('status-dot')
    dot.className = 'status-dot'
    if (status === 'ready' || status === 'connected') {
      dot.classList.add('connected')
      hideDisconnectBanner()
    } else if (status === 'connecting' || status === 'reconnecting') {
      dot.classList.add('connecting')
      showDisconnectBanner(true)
    } else if (status === 'disconnected') {
      showDisconnectBanner(false)
    }
  })
}

function toggleVoiceInput(SR) {
  if (_isRecording && _recognition) { _recognition.stop(); return }
  const micBtn = document.getElementById('mic-btn')
  _recognition = new SR()
  _recognition.lang = navigator.language || 'zh-CN'
  _recognition.interimResults = true
  _recognition.continuous = false
  _isRecording = true
  micBtn.classList.add('recording')

  _recognition.onresult = (e) => {
    _textarea.value = Array.from(e.results).map(r => r[0].transcript).join('')
    autoResize()
    updateSendState()
  }
  _recognition.onend = () => {
    _isRecording = false
    micBtn.classList.remove('recording')
    _recognition = null
    _textarea.focus()
  }
  _recognition.onerror = (e) => {
    _isRecording = false
    micBtn.classList.remove('recording')
    _recognition = null
    console.error('[voice] error:', e.error)
    if (e.error === 'not-allowed') appendSystemMessage('请允许麦克风权限后重试')
    else if (e.error === 'network') appendSystemMessage('语音服务不可用（需要网络连接 Google 服务）')
    else if (e.error !== 'aborted' && e.error !== 'no-speech') appendSystemMessage(`${t('voice.error')} (${e.error})`)
  }
  _recognition.start()
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
  _textarea.value = ''
  _textarea.style.height = 'auto'
  clearAttachments()
  updateSendState()

  // 如果正在发送或流式响应中，加入队列
  if (_isSending || _isStreaming) {
    _messageQueue.push({ text, attachments })
    // 不再这里 append，等发送时统一处理
    return
  }

  await doSend(text, attachments)
}

/** 实际发送消息 */
async function doSend(text, attachments) {
  if (text) {
    console.log('[chat] appendUserMessage:', text.substring(0, 50))
    appendUserMessage(text, attachments)
    // 保存用户消息到本地（含附件）
    saveMessage({ id: uuid(), sessionKey: _sessionKey, role: 'user', content: text, attachments: attachments?.length ? attachments : undefined, timestamp: Date.now() })
  }
  showTyping(true)
  _isSending = true
  _textarea.disabled = true

  try {
    await wsClient.chatSend(_sessionKey, text, attachments.length ? attachments : undefined)
  } catch (err) {
    showTyping(false)
    if (err.message.includes('未连接') || err.message.includes('超时') || err.message.includes('重连') || err.message.includes('timeout') || err.message.includes('reconnect')) {
      appendSystemMessage(t('chat.reconnecting'))
    } else {
      appendSystemMessage(`${t('chat.send.error')}: ${err.message}`)
    }
  } finally {
    _isSending = false
    _textarea.disabled = false
    _textarea.focus()
  }
}

/** 处理队列中的下一条消息（在 final/error/aborted 后调用） */
function processMessageQueue() {
  if (_messageQueue.length === 0) return
  if (_isSending || _isStreaming) return
  const next = _messageQueue.shift()
  // 用户消息已经在入队时 append 过了，这里不再 append
  showTyping(true)
  _isSending = true
  _textarea.disabled = true
  wsClient.chatSend(_sessionKey, next.text, next.attachments?.length ? next.attachments : undefined)
    .catch(err => {
      showTyping(false)
      appendSystemMessage(`${t('chat.send.error')}: ${err.message}`)
    })
    .finally(() => {
      _isSending = false
      _textarea.disabled = false
      _textarea.focus()
    })
}

function handleEvent(msg) {
  console.log('[chat] handleEvent:', msg.event, msg)
  const { event, payload } = msg
  if (event === 'chat') handleChatEvent(payload)
  else if (event === 'agent') handleAgentEvent(payload)
}

function handleChatEvent(payload) {
  if (!payload) return
  console.log('[chat] handleChatEvent state:', payload.state, 'sessionKey:', payload.sessionKey, '_sessionKey:', _sessionKey)
  // sessionKey 过滤 - 但如果 sessionKey 为空也处理（兼容没有返回 sessionKey 的情况）
  if (payload.sessionKey && payload.sessionKey !== _sessionKey && _sessionKey) return

  const { state } = payload

  if (state === 'delta') {
    const c = extractContent(payload.message)
    if (c?.text && c.text.length > _currentAiText.length) {
      showTyping(false)
      if (!_currentAiBubble) { _currentAiBubble = createAiBubble(); _currentRunId = payload.runId }
      _currentAiText = c.text
      if (c.images.length) _currentAiImages = c.images
      throttledRender()
    }
    return
  }

  if (state === 'final') {
    const c = extractContent(payload.message)
    const finalText = c?.text
    const finalImages = c?.images || []
    // 忽略空 final（Gateway 会为一条消息触发多个 run，部分是空 final）
    if (!_currentAiBubble && !finalText && !finalImages.length) return
    showTyping(false)
    // 如果流式阶段没有创建 bubble，从 final message 中提取
    if (!_currentAiBubble && (finalText || finalImages.length)) {
      _currentAiBubble = createAiBubble()
      _currentAiText = finalText || ''
      _currentAiImages = finalImages
    }
    // 移除光标元素
    const wrapper = _currentAiBubble?.parentElement
    if (wrapper) {
      const cursor = wrapper.querySelector('.typing-cursor')
      if (cursor) cursor.remove()
      const time = wrapper.querySelector('.msg-time')
      if (time) time.textContent = formatTime(new Date())
    }
    if (_currentAiBubble && (_currentAiText || _currentAiImages.length)) {
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
      appendImagesToEl(_currentAiBubble, _currentAiImages)
      bindImageClicks(_currentAiBubble)
      initVoiceBubbles(_currentAiBubble)
    }
    // 保存 AI 回复到本地
    if (_currentAiText) {
      saveMessage({ id: payload.runId || uuid(), sessionKey: _sessionKey, role: 'assistant', content: _currentAiText, timestamp: Date.now() })
    }
    resetStreamState()
    processMessageQueue()
    return
  }

  if (state === 'aborted') {
    showTyping(false)
    if (_currentAiText.trim()) {
      if (_currentAiBubble) {
        _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
        bindImageClicks(_currentAiBubble)
        initVoiceBubbles(_currentAiBubble)
      }
      // 移除光标，更新时间
      const wrapper = _currentAiBubble?.parentElement
      if (wrapper) {
        const cursor = wrapper.querySelector('.typing-cursor')
        if (cursor) cursor.remove()
        const time = wrapper.querySelector('.msg-time')
        if (time) time.textContent = formatTime(new Date())
      }
    }
    appendSystemMessage(t('chat.aborted'))
    resetStreamState()
    processMessageQueue()
    return
  }

  if (state === 'error') {
    const errMsg = payload.errorMessage || '未知错误'
    // 流式进行中（lifecycle start 已触发），Gateway 可能自动重试
    if (_isStreaming) {
      console.warn('[chat] 流式中临时错误，等待 Gateway 重试:', errMsg)
      appendTransientWarning(`⚠ ${errMsg}`)
      return
    }
    // 非流式状态，终态错误
    showTyping(false)
    appendSystemMessage(`错误: ${errMsg}`)
    resetStreamState()
    processMessageQueue()
    return
  }
}

function handleAgentEvent(payload) {
  if (!payload) return
  // 过滤非当前会话的事件
  if (payload.sessionKey && payload.sessionKey !== _sessionKey) return
  const { runId, stream, data } = payload

  if (stream === 'lifecycle') {
    if (data?.phase === 'start') {
      _currentRunId = runId; showTyping(true); _isStreaming = true; updateSendState()
      clearTransientWarnings()
      // 安全超时：如果 60s 内没有 chat final / lifecycle end，强制重置
      clearTimeout(_streamSafetyTimer)
      _streamSafetyTimer = setTimeout(() => {
        if (_isStreaming) { console.warn('[chat] 流式安全超时，强制重置'); resetStreamState() }
      }, 60000)
    }
    if (data?.phase === 'end') {
      showTyping(false)
      clearTimeout(_streamSafetyTimer)
      // 如果有活跃气泡内容，说明这是最后一个 run，需要彻底清理
      if (_currentAiBubble && (_currentAiText || _currentAiImages.length)) {
        resetStreamState()
      } else {
        _isStreaming = false; updateSendState()
      }
      processMessageQueue()
    }
    return
  }

  // agent assistant 事件 — 用累积 text 驱动流式渲染（比 chat delta 频率高）
  if (stream === 'assistant') {
    const text = data?.text
    if (text && typeof text === 'string') {
      const cleaned = stripThinkingTags(text)
      if (cleaned && cleaned.length > _currentAiText.length) {
        showTyping(false)
        clearTransientWarnings()
        if (!_currentAiBubble) { _currentAiBubble = createAiBubble(); _currentRunId = runId }
        _currentAiText = cleaned
        throttledRender()
      }
    }
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
  clearTimeout(_streamSafetyTimer)
  // 最后一次渲染确保完整
  if (_currentAiBubble && (_currentAiText || _currentAiImages.length)) {
    _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
    appendImagesToEl(_currentAiBubble, _currentAiImages)
    bindImageClicks(_currentAiBubble)
    initVoiceBubbles(_currentAiBubble)
    scrollToBottom()
  }
  _renderPending = false
  _lastRenderTime = 0
  _currentAiBubble = null
  _currentAiText = ''
  _currentAiImages = []
  _currentRunId = null
  _isStreaming = false
  _toolCards.clear()
  updateSendState()
}

/** 节流渲染：避免高频 delta 导致疯狂重绘 */
let _lastRenderTime = 0

function throttledRender() {
  if (_renderPending) return
  const now = performance.now()
  const elapsed = now - _lastRenderTime

  if (elapsed >= RENDER_THROTTLE) {
    // 距离上次渲染已超过阈值，立即渲染
    doRender()
  } else {
    // 在下一个 rAF 渲染
    _renderPending = true
    requestAnimationFrame(() => {
      _renderPending = false
      doRender()
    })
  }
}

function doRender() {
  _lastRenderTime = performance.now()
  if (_currentAiBubble && _currentAiText) {
    _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
    scrollToBottom()
  }
}

function createAiBubble(msgTime) {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg ai'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  
  // 添加光标
  const cursor = document.createElement('span')
  cursor.className = 'typing-cursor'
  cursor.innerHTML = ' ▋'
  
  // 添加时间戳
  const time = document.createElement('div')
  time.className = 'msg-time'
  time.textContent = formatTime(msgTime || new Date())
  
  wrapper.appendChild(bubble)
  wrapper.appendChild(cursor)
  wrapper.appendChild(time)
  
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

function appendUserMessage(text, attachments, msgTime) {
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
  initVoiceBubbles(bubble)

  // 添加时间戳
  const time = document.createElement('div')
  time.className = 'msg-time'
  time.textContent = formatTime(msgTime || new Date())
  
  wrapper.appendChild(bubble)
  wrapper.appendChild(time)
  _messagesEl.insertBefore(wrapper, _typingEl)
  scrollToBottom()
}

function appendAiMessage(text, msgTime, images) {
  const wrapper = document.createElement('div')
  wrapper.className = 'msg ai'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  bubble.innerHTML = renderMarkdown(text)
  appendImagesToEl(bubble, images)
  bindImageClicks(bubble)
  initVoiceBubbles(bubble)

  // 添加时间戳
  const time = document.createElement('div')
  time.className = 'msg-time'
  time.textContent = formatTime(msgTime || new Date())
  
  wrapper.appendChild(bubble)
  wrapper.appendChild(time)
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

/** 显示可自动消失的临时警告（流式恢复后淡出） */
function appendTransientWarning(text) {
  const el = document.createElement('div')
  el.className = 'system-msg transient-warning'
  el.textContent = text
  _messagesEl.insertBefore(el, _typingEl)
  scrollToBottom()
  return el
}

/** 清除所有临时警告（流式恢复时调用） */
function clearTransientWarnings() {
  const warnings = _messagesEl.querySelectorAll('.transient-warning')
  warnings.forEach(el => {
    el.style.transition = 'opacity 0.5s'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 500)
  })
}

function showTyping(show) {
  _typingEl.classList.toggle('visible', show)
  if (show) scrollToBottom()
}

function scrollToBottom() {
  requestAnimationFrame(() => { _messagesEl.scrollTop = _messagesEl.scrollHeight })
}

function appendImagesToEl(el, images) {
  if (!images?.length) return
  images.forEach(img => {
    const imgEl = document.createElement('img')
    imgEl.src = `data:${img.mediaType};base64,${img.data}`
    imgEl.className = 'msg-img'
    el.appendChild(imgEl)
  })
}

function bindImageClicks(container) {
  container.querySelectorAll('img').forEach(img => { img.onclick = () => showLightbox(img.src) })
}

/** 语音气泡：加载时长、设置宽度、绑定播放 */
let _playingAudio = null
function initVoiceBubbles(container) {
  const MIN_W = 80, MAX_W = 220, MIN_S = 1, MAX_S = 60
  container.querySelectorAll('.voice-bubble:not([data-init])').forEach(el => {
    el.setAttribute('data-init', '1')
    const src = el.dataset.src
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = src
    audio.onloadedmetadata = () => {
      const dur = Math.round(audio.duration)
      el.querySelector('.voice-dur').textContent = dur + '″'
      const clamped = Math.max(MIN_S, Math.min(dur, MAX_S))
      const ratio = (clamped - MIN_S) / (MAX_S - MIN_S)
      el.style.width = (MIN_W + ratio * (MAX_W - MIN_W)) + 'px'
    }
    el.onclick = () => {
      if (_playingAudio && _playingAudio !== audio) { _playingAudio.pause(); _playingAudio.currentTime = 0; document.querySelectorAll('.voice-bubble.playing').forEach(b => b.classList.remove('playing')) }
      if (audio.paused) { audio.play(); el.classList.add('playing'); _playingAudio = audio }
      else { audio.pause(); audio.currentTime = 0; el.classList.remove('playing'); _playingAudio = null }
    }
    audio.onended = () => { el.classList.remove('playing'); _playingAudio = null }
  })
}

function escapeText(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/** 打字机光标 */
function createCursor() {
  const cursor = document.createElement('span')
  cursor.className = 'typing-cursor'
  cursor.innerHTML = ' ▋'
  return cursor
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export async function loadHistory() {
  if (!_sessionKey) return
  const hasExisting = _messagesEl?.querySelector('.msg')

  // 首次加载：显示本地缓存
  if (!hasExisting && isStorageAvailable()) {
    const local = await getLocalMessages(_sessionKey, 200)
    if (local.length) {
      clearMessages()
      local.forEach(msg => {
        const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
        if (msg.role === 'user') appendUserMessage(msg.content || '', msg.attachments || null, msgTime)
        else appendAiMessage(msg.content || '', msgTime)
      })
      scrollToBottom()
    }
  }

  // 从服务端拉取
  if (!wsClient.gatewayReady) return
  try {
    const result = await wsClient.chatHistory(_sessionKey, 200)
    if (!result?.messages?.length) {
      if (!_messagesEl.querySelector('.msg')) { clearMessages(); appendSystemMessage(t('chat.no.messages')) }
      return
    }
    // 去重
    const deduped = dedupeHistory(result.messages)
    // 算 hash，没变就跳过渲染
    const hash = deduped.map(m => `${m.role}:${m.text?.length || 0}`).join('|')
    if (hash === _lastHistoryHash && hasExisting) return
    _lastHistoryHash = hash

    clearMessages()
    deduped.forEach(msg => {
      const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
      if (msg.role === 'user') {
        appendUserMessage(msg.text, msg.images?.length ? msg.images.map(i => ({ content: i.data, mimeType: i.mediaType })) : null, msgTime)
      } else if (msg.role === 'assistant') {
        appendAiMessage(msg.text, msgTime, msg.images)
      }
    })
    saveMessages(result.messages.map(m => {
      const c = extractContent(m)
      return { id: m.id || uuid(), sessionKey: _sessionKey, role: m.role, content: c?.text || '', timestamp: m.timestamp || Date.now() }
    }))
    scrollToBottom()
  } catch (e) {
    console.error('[chat] loadHistory error:', e)
    if (!_messagesEl.querySelector('.msg')) appendSystemMessage(`${t('chat.load.error')}: ${e.message}`)
  }
}

/** 去重：合并 Gateway 重试产生的重复消息 */
function dedupeHistory(messages) {
  const deduped = []
  for (const msg of messages) {
    if (msg.role === 'toolResult') continue
    const c = extractContent(msg)
    if (!c?.text && !c?.images?.length) continue
    const last = deduped[deduped.length - 1]
    if (last && last.role === msg.role) {
      if (msg.role === 'user' && last.text === (c.text || '')) continue
      if (msg.role === 'assistant') {
        last.text = [last.text, c.text].filter(Boolean).join('\n')
        last.images = [...(last.images || []), ...(c.images || [])]
        continue
      }
    }
    deduped.push({ role: msg.role, text: c.text || '', images: c.images, timestamp: msg.timestamp })
  }
  return deduped
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
  let label = 'ClawApp'
  if (parts.length >= 3) {
    const agent = parts[1]
    const channel = parts.slice(2).join(':')
    if (channel === 'main') label = t('session.main')
    else label = channel.length > 20 ? channel.substring(0, 20) + '…' : channel
    if (agent !== 'main') label = `[${agent}] ${label}`
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
  const defaultAgent = wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main'

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
    </div>
    <div style="margin:0 0 16px">
      <div id="agent-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
        <span style="font-size:13px;color:var(--text-muted)">${t('session.new.agent')}</span>
        <span id="agent-arrow" style="font-size:11px;color:var(--text-muted)">▶</span>
      </div>
      <div id="agent-field" style="display:none;margin-top:8px">
        <input type="text" id="new-session-agent" value="${defaultAgent}" placeholder="main"
          style="width:100%;height:40px;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:0 12px;color:var(--text-primary);font-size:14px;outline:none" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${t('session.new.agent.hint')}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="session-dialog-btn cancel">${t('cancel')}</button>
      <button class="session-dialog-btn confirm">${t('session.new.create')}</button>
    </div>
  `

  dialog.querySelector('#agent-toggle').onclick = () => {
    const f = dialog.querySelector('#agent-field')
    const visible = f.style.display !== 'none'
    f.style.display = visible ? 'none' : 'block'
    dialog.querySelector('#agent-arrow').textContent = visible ? '▶' : '▼'
  }
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); dialog.remove() } }
  dialog.querySelector('.cancel').onclick = () => { overlay.remove(); dialog.remove() }
  dialog.querySelector('.confirm').onclick = () => {
    const name = dialog.querySelector('#new-session-name').value.trim()
    if (!name) return
    const agent = dialog.querySelector('#new-session-agent')?.value.trim() || defaultAgent
    const newKey = `agent:${agent}:${name}`
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

/** 断连横幅 */
function showDisconnectBanner(isReconnecting) {
  hideDisconnectBanner()
  const banner = document.createElement('div')
  banner.className = 'disconnect-banner'
  banner.id = 'disconnect-banner'
  if (isReconnecting) {
    banner.innerHTML = `<span class="disconnect-text">${t('chat.reconnecting')}</span>`
  } else {
    banner.innerHTML = `
      <span class="disconnect-text">${t('chat.disconnected')}</span>
      <button class="disconnect-retry-btn" id="retry-connect-btn">${t('chat.retry')}</button>
    `
  }
  // 插入到 header 后面
  const header = document.querySelector('.chat-header')
  if (header) header.after(banner)

  const retryBtn = document.getElementById('retry-connect-btn')
  if (retryBtn) {
    retryBtn.onclick = () => {
      showDisconnectBanner(true)
      wsClient.reconnect()
    }
  }
}

function hideDisconnectBanner() {
  document.getElementById('disconnect-banner')?.remove()
}

/** 切换到指定会话 */
function switchSession(newKey) {
  _sessionKey = newKey
  localStorage.setItem(STORAGE_SESSION_KEY, newKey)
  _lastHistoryHash = ''
  resetStreamState()
  updateSessionTitle()
  showLoadingOverlay()
  loadHistory().finally(() => hideLoadingOverlay())
}

/** 加载遮罩 */
function showLoadingOverlay() {
  hideLoadingOverlay()
  const el = document.createElement('div')
  el.className = 'chat-loading-overlay'
  el.innerHTML = '<div class="chat-loading-spinner"></div>'
  _messagesEl?.parentElement?.appendChild(el)
}

function hideLoadingOverlay() {
  document.querySelector('.chat-loading-overlay')?.remove()
}
