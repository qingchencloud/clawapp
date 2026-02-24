/**
 * SSE + HTTP POST 客户端 - 对接 ClawApp 代理服务端
 *
 * 架构：手机 ←SSE+POST→ 代理服务端 ←WS→ OpenClaw Gateway
 * - POST /api/connect   建立会话
 * - GET  /api/events    SSE 事件流
 * - POST /api/send      RPC 转发
 * - POST /api/disconnect 断开会话
 */

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const REQUEST_TIMEOUT = 30000
const MAX_RECONNECT_DELAY = 30000

export class WsClient {
  constructor() {
    this._host = ''
    this._token = ''
    this._baseUrl = ''
    this._sid = null
    this._es = null          // EventSource
    this._connected = false
    this._gatewayReady = false
    this._intentionalClose = false
    this._onStatusChange = null
    this._snapshot = null
    this._hello = null
    this._sessionKey = null
    this._readyCallbacks = []
    this._eventListeners = []
    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._esId = 0           // 区分新旧 EventSource 实例
  }

  get connected() { return this._connected }
  get gatewayReady() { return this._gatewayReady }
  get snapshot() { return this._snapshot }
  get hello() { return this._hello }
  get sessionKey() { return this._sessionKey }

  onStatusChange(fn) { this._onStatusChange = fn }

  onReady(fn) {
    this._readyCallbacks.push(fn)
    return () => { this._readyCallbacks = this._readyCallbacks.filter(cb => cb !== fn) }
  }

  onEvent(callback) {
    this._eventListeners.push(callback)
    return () => { this._eventListeners = this._eventListeners.filter(fn => fn !== callback) }
  }

  /** 连接到代理服务端 */
  async connect(host, token) {
    this._host = host
    this._token = token
    this._baseUrl = `${location.protocol}//${host}`
    this._intentionalClose = false
    this._setConnected(false, 'connecting')

    try {
      // 1. POST /api/connect 建立会话
      const res = await fetch(`${this._baseUrl}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      // 容错：CF Tunnel 502 等情况会返回 HTML 而非 JSON
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error(`服务暂时不可用 (${res.status})`)
      }
      const data = await res.json()

      if (!data.ok) {
        const msg = data.error || '连接失败'
        if (res.status === 401) {
          this._setConnected(false, 'auth_failed', msg)
          this._readyCallbacks.forEach(fn => {
            try { fn(null, null, { error: true, message: msg }) } catch (e) {}
          })
          return
        }
        throw new Error(msg)
      }

      this._sid = data.sid
      this._hello = data.hello
      this._snapshot = data.snapshot
      this._sessionKey = data.sessionKey

      // 2. 开启 SSE 事件流
      this._setupEventSource()

      // 3. 标记就绪
      this._gatewayReady = true
      this._connected = true
      this._reconnectAttempts = 0
      this._setConnected(true, 'ready')
      this._readyCallbacks.forEach(fn => {
        try { fn(this._hello, this._sessionKey) } catch (e) {}
      })
    } catch (e) {
      console.error('[api] connect error:', e)
      this._setConnected(false, 'error', e.message)
      if (!this._intentionalClose) this._scheduleReconnect()
    }
  }

  /** 建立 SSE 事件流 */
  _setupEventSource() {
    this._closeEventSource()
    const esId = ++this._esId
    const url = `${this._baseUrl}/api/events?sid=${encodeURIComponent(this._sid)}`
    const es = new EventSource(url)
    this._es = es

    // 通用事件（Gateway 推送的消息）
    es.addEventListener('message', (evt) => {
      if (esId !== this._esId) return
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }
      this._eventListeners.forEach(fn => {
        try { fn(msg) } catch (e) { console.error('[api] handler error:', e) }
      })
    })

    // proxy.ready（SSE 重连后的确认）
    es.addEventListener('proxy.ready', () => {
      if (esId !== this._esId) return
      if (!this._gatewayReady) {
        this._gatewayReady = true
        this._setConnected(true, 'ready')
      }
    })

    // proxy.disconnect（Gateway 断开）
    es.addEventListener('proxy.disconnect', (evt) => {
      if (esId !== this._esId) return
      this._gatewayReady = false
      this._setConnected(false, 'disconnected')
      this._closeEventSource()
      if (!this._intentionalClose) this._scheduleReconnect()
    })

    es.onerror = () => {
      if (esId !== this._esId) return
      // EventSource 会自动重连，但如果会话已失效需要完整重连
      if (this._gatewayReady) {
        // SSE 短暂断开，EventSource 自动重连，不需要干预
        console.log('[api] SSE 断开，等待自动重连...')
      }
    }
  }

  /** 断开连接 */
  disconnect() {
    this._intentionalClose = true
    this._clearReconnectTimer()
    this._closeEventSource()
    if (this._sid && this._baseUrl) {
      fetch(`${this._baseUrl}/api/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: this._sid }),
      }).catch(() => {})
    }
    this._sid = null
    this._gatewayReady = false
    this._setConnected(false)
  }

  /** 手动触发重连 */
  reconnect() {
    if (!this._host || !this._token) return
    this._intentionalClose = false
    this._reconnectAttempts = 0
    this._clearReconnectTimer()
    this._closeEventSource()
    this._sid = null
    this._gatewayReady = false
    this.connect(this._host, this._token)
  }

  /** 发送 RPC 请求 */
  async request(method, params = {}) {
    if (!this._sid || !this._gatewayReady) {
      // 等待重连就绪后重试
      if (!this._intentionalClose && this._reconnectAttempts > 0) {
        return new Promise((resolve, reject) => {
          const waitTimeout = setTimeout(() => {
            unsub()
            reject(new Error('等待重连超时'))
          }, 15000)
          const unsub = this.onReady(() => {
            clearTimeout(waitTimeout)
            unsub()
            this.request(method, params).then(resolve, reject)
          })
        })
      }
      throw new Error('未连接')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    try {
      const res = await fetch(`${this._baseUrl}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: this._sid, method, params }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '请求失败')
      return data.payload
    } catch (e) {
      clearTimeout(timer)
      if (e.name === 'AbortError') throw new Error('请求超时')
      throw e
    }
  }

  // ==================== 业务方法 ====================

  chatSend(sessionKey, message, attachments) {
    const params = { sessionKey, message, deliver: false, idempotencyKey: uuid() }
    if (attachments?.length) params.attachments = attachments
    return this.request('chat.send', params)
  }

  chatHistory(sessionKey, limit = 200) {
    return this.request('chat.history', { sessionKey, limit })
  }

  chatAbort(sessionKey, runId) {
    const params = { sessionKey }
    if (runId) params.runId = runId
    return this.request('chat.abort', params)
  }

  sessionsList(limit = 50) {
    return this.request('sessions.list', { limit })
  }

  sessionsDelete(key) {
    return this.request('sessions.delete', { key })
  }

  sessionsReset(key) {
    return this.request('sessions.reset', { key })
  }

  // ==================== 内部辅助 ====================

  _setConnected(val, status, errorMsg) {
    this._connected = val
    this._onStatusChange?.(status || (val ? 'connected' : 'disconnected'), errorMsg)
  }

  _closeEventSource() {
    if (this._es) {
      const old = this._es
      this._es = null
      this._esId++
      try { old.close() } catch {}
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  _scheduleReconnect() {
    this._clearReconnectTimer()
    const delay = this._reconnectAttempts < 3
      ? 1000
      : Math.min(1000 * Math.pow(2, this._reconnectAttempts - 2), MAX_RECONNECT_DELAY)
    this._reconnectAttempts++
    this._setConnected(false, 'reconnecting')
    this._reconnectTimer = setTimeout(() => this.connect(this._host, this._token), delay)
  }
}

export const wsClient = new WsClient()
