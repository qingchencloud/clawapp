function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const HEARTBEAT_INTERVAL = 25000
const REQUEST_TIMEOUT = 30000
const MAX_RECONNECT_DELAY = 30000

export class WsClient {
  constructor() {
    this._ws = null
    this._url = ''
    this._token = ''
    this._pending = new Map()
    this._eventListeners = []
    this._reconnectAttempts = 0
    this._heartbeatTimer = null
    this._reconnectTimer = null
    this._connected = false
    this._intentionalClose = false
    this._onStatusChange = null
  }

  get connected() { return this._connected }

  onStatusChange(fn) { this._onStatusChange = fn }

  connect(host, token) {
    this._intentionalClose = false
    this._token = token
    this._url = `ws://${host}/ws?token=${encodeURIComponent(token)}`
    this._doConnect()
  }

  disconnect() {
    this._intentionalClose = true
    this._cleanup()
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
    this._setConnected(false)
  }

  _doConnect() {
    this._cleanup()
    this._setConnected(false, 'connecting')

    try {
      this._ws = new WebSocket(this._url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this._ws.onopen = () => {
      this._reconnectAttempts = 0
      this._setConnected(true)
      this._startHeartbeat()
    }

    this._ws.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.type === 'pong') return

      if (msg.type === 'res') {
        const cb = this._pending.get(msg.id)
        if (cb) {
          this._pending.delete(msg.id)
          clearTimeout(cb.timer)
          if (msg.ok) cb.resolve(msg.payload)
          else cb.reject(new Error(msg.error || 'request failed'))
        }
        return
      }

      if (msg.type === 'event') {
        this._eventListeners.forEach(fn => fn(msg))
      }
    }

    this._ws.onclose = () => {
      this._setConnected(false)
      this._cleanup()
      if (!this._intentionalClose) this._scheduleReconnect()
    }

    this._ws.onerror = () => {}
  }

  _setConnected(val, status) {
    this._connected = val
    if (this._onStatusChange) {
      this._onStatusChange(status || (val ? 'connected' : 'disconnected'))
    }
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_INTERVAL)
  }

  _cleanup() {
    clearInterval(this._heartbeatTimer)
    clearTimeout(this._reconnectTimer)
    this._heartbeatTimer = null
    this._reconnectTimer = null
  }

  _scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), MAX_RECONNECT_DELAY)
    this._reconnectAttempts++
    this._setConnected(false, 'connecting')
    this._reconnectTimer = setTimeout(() => this._doConnect(), delay)
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket 未连接'))
      }

      const id = uuid()
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error('请求超时'))
      }, REQUEST_TIMEOUT)

      this._pending.set(id, { resolve, reject, timer })

      this._ws.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }))
    })
  }

  chatSend(sessionKey, message, attachments) {
    const params = {
      sessionKey,
      message,
      idempotencyKey: uuid(),
    }
    if (attachments?.length) params.attachments = attachments
    return this.request('chat.send', params)
  }

  chatHistory(sessionKey, limit = 50) {
    return this.request('chat.history', { sessionKey, limit })
  }

  chatAbort(sessionKey) {
    return this.request('chat.abort', { sessionKey })
  }

  onEvent(callback) {
    this._eventListeners.push(callback)
    return () => {
      this._eventListeners = this._eventListeners.filter(fn => fn !== callback)
    }
  }
}

export const wsClient = new WsClient()
