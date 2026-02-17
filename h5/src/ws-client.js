/**
 * WebSocket 客户端 - 对接 ClawApp 代理服务端
 * 
 * 协议流程：
 * 1. 连接到代理服务端 ws://host/ws?token=xxx
 * 2. 收到 proxy.connected 事件
 * 3. 代理服务端完成与 Gateway 的握手
 * 4. 收到 proxy.ready 事件（包含 hello-ok payload 和 snapshot）
 * 5. 从 snapshot.sessionDefaults.mainSessionKey 获取 sessionKey
 * 6. 开始正常通信（chat.send / chat.history / chat.abort）
 */

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const REQUEST_TIMEOUT = 30000
const MAX_RECONNECT_DELAY = 30000
const PING_INTERVAL = 25000

export class WsClient {
  constructor() {
    this._ws = null
    this._url = ''
    this._pending = new Map()
    this._eventListeners = []
    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._connected = false
    this._gatewayReady = false
    this._intentionalClose = false
    this._onStatusChange = null
    this._snapshot = null
    this._hello = null
    this._sessionKey = null
    this._readyCallbacks = []
    this._pingTimer = null
    this._wsId = 0  // 用于区分新旧 WebSocket 实例
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

  connect(host, token) {
    this._intentionalClose = false
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this._url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`
    this._doConnect()
  }

  disconnect() {
    this._intentionalClose = true
    this._stopPing()
    this._clearReconnectTimer()
    this._flushPending()
    this._closeWs()
    this._setConnected(false)
    this._gatewayReady = false
  }

  /** 手动触发重连 */
  reconnect() {
    if (!this._url) return
    this._intentionalClose = false
    this._reconnectAttempts = 0
    this._stopPing()
    this._clearReconnectTimer()
    this._flushPending()
    this._closeWs()
    this._doConnect()
  }

  _doConnect() {
    this._closeWs()
    this._gatewayReady = false
    this._setConnected(false, 'connecting')

    const wsId = ++this._wsId  // 标记当前实例
    let ws
    try { ws = new WebSocket(this._url) } catch { this._scheduleReconnect(); return }
    this._ws = ws

    ws.onopen = () => {
      if (wsId !== this._wsId) return  // 已被新实例替代
      this._reconnectAttempts = 0
      this._setConnected(true)
      this._startPing()
    }

    ws.onmessage = (evt) => {
      if (wsId !== this._wsId) return
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.type === 'res') {
        const cb = this._pending.get(msg.id)
        if (cb) {
          this._pending.delete(msg.id)
          clearTimeout(cb.timer)
          if (msg.ok) cb.resolve(msg.payload)
          else cb.reject(new Error(msg.error?.message || msg.error?.code || 'request failed'))
        }
        return
      }

      if (msg.type === 'event') {
        if (msg.event === 'proxy.ready') { this._handleProxyReady(msg.data || msg.payload); return }
        if (msg.event === 'proxy.disconnect') {
          this._gatewayReady = false
          this._setConnected(false, 'disconnected')
          return
        }
        if (msg.event === 'proxy.error') { console.error('[ws] proxy error:', msg.data); return }
        this._eventListeners.forEach(fn => { try { fn(msg) } catch (e) { console.error('[ws] handler error:', e) } })
      }
    }

    ws.onclose = () => {
      if (wsId !== this._wsId) return  // 旧实例的 onclose，忽略
      this._ws = null
      this._setConnected(false)
      this._gatewayReady = false
      this._stopPing()
      this._flushPending()
      if (!this._intentionalClose) this._scheduleReconnect()
    }

    ws.onerror = () => {}
  }

  _handleProxyReady(data) {
    this._hello = data?.hello || null
    this._snapshot = this._hello?.snapshot || null
    const defaults = this._snapshot?.sessionDefaults
    if (defaults?.mainSessionKey) {
      this._sessionKey = defaults.mainSessionKey
    } else {
      const agentId = defaults?.defaultAgentId || 'main'
      this._sessionKey = `agent:${agentId}:main`
    }
    this._gatewayReady = true
    this._setConnected(true, 'ready')
    this._readyCallbacks.forEach(fn => {
      try { fn(this._hello, this._sessionKey) } catch (e) { console.error('[ws] ready cb error:', e) }
    })
  }

  _setConnected(val, status) {
    this._connected = val
    this._onStatusChange?.(status || (val ? 'connected' : 'disconnected'))
  }

  _closeWs() {
    if (this._ws) {
      const old = this._ws
      this._ws = null
      this._wsId++  // 让旧实例的回调全部失效
      try { old.close() } catch {}
    }
  }

  _flushPending() {
    for (const [, cb] of this._pending) { clearTimeout(cb.timer); cb.reject(new Error('连接已断开')) }
    this._pending.clear()
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
  }

  _scheduleReconnect() {
    this._clearReconnectTimer()
    const delay = this._reconnectAttempts < 3
      ? 1000
      : Math.min(1000 * Math.pow(2, this._reconnectAttempts - 2), MAX_RECONNECT_DELAY)
    this._reconnectAttempts++
    this._setConnected(false, 'reconnecting')
    this._reconnectTimer = setTimeout(() => this._doConnect(), delay)
  }

  _startPing() {
    this._stopPing()
    this._pingTimer = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        try { this._ws.send('{"type":"ping"}') } catch {}
      }
    }, PING_INTERVAL)
  }

  _stopPing() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null }
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN || !this._gatewayReady) {
        // 如果正在重连中，等待就绪后重试
        if (!this._intentionalClose && (this._reconnectAttempts > 0 || !this._gatewayReady)) {
          const waitTimeout = setTimeout(() => {
            unsub()
            reject(new Error('等待重连超时'))
          }, 15000)
          const unsub = this.onReady(() => {
            clearTimeout(waitTimeout)
            unsub()
            this.request(method, params).then(resolve, reject)
          })
          return
        }
        return reject(new Error('WebSocket 未连接'))
      }
      const id = uuid()
      const timer = setTimeout(() => { this._pending.delete(id); reject(new Error('请求超时')) }, REQUEST_TIMEOUT)
      this._pending.set(id, { resolve, reject, timer })
      this._ws.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

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

  onEvent(callback) {
    this._eventListeners.push(callback)
    return () => { this._eventListeners = this._eventListeners.filter(fn => fn !== callback) }
  }
}

export const wsClient = new WsClient()
