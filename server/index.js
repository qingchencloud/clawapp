/**
 * ClawApp SSE + HTTP POST 代理服务端
 *
 * 架构：
 * - 手机 ←SSE+POST→ 代理服务端 ←WS→ OpenClaw Gateway
 * - POST /api/connect  建立会话（握手 Gateway）
 * - GET  /api/events   SSE 事件流（服务端推送）
 * - POST /api/send     发送请求（RPC 转发）
 * - POST /api/disconnect 断开会话
 */

import { config } from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID, generateKeyPairSync, createHash, sign as ed25519Sign, createPrivateKey } from 'crypto';
import { readFileSync, writeFileSync, existsSync, createReadStream, statSync } from 'fs';

// 加载环境变量
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const CONFIG = {
  port: parseInt(process.env.PROXY_PORT, 10) || 3210,
  proxyToken: process.env.PROXY_TOKEN || '',
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  h5DistPath: join(__dirname, '../h5/dist'),
};

// Ed25519 设备密钥（OpenClaw 2.15+ device 认证）
const DEVICE_KEY_PATH = join(__dirname, '.device-key.json');
const deviceKey = (() => {
  if (existsSync(DEVICE_KEY_PATH)) {
    return JSON.parse(readFileSync(DEVICE_KEY_PATH, 'utf8'));
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const dk = {
    deviceId: createHash('sha256').update(pubRaw).digest('hex'),
    publicKey: pubRaw.toString('base64url'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  writeFileSync(DEVICE_KEY_PATH, JSON.stringify(dk, null, 2));
  return dk;
})();
const devicePrivateKey = createPrivateKey(deviceKey.privateKeyPem);

// 日志
const log = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args),
  debug: (msg, ...args) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`, ...args),
};

// 会话管理
const sessions = new Map();

const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write'];
const SSE_HEARTBEAT_INTERVAL = 15000;
const SESSION_CLEANUP_INTERVAL = 60000;
const SESSION_IDLE_TIMEOUT = 300000;  // 5min
const UPSTREAM_LINGER = 120000;       // SSE 断开后上游保持 2min
const EVENT_BUFFER_MAX = 200;
const REQUEST_TIMEOUT = 30000;
const CONNECT_TIMEOUT = 10000;
const GATEWAY_RETRY_COUNT = 3;
const GATEWAY_RETRY_DELAY = 1000;

/**
 * 生成 connect 握手帧（含 Ed25519 device 签名）
 */
function createConnectFrame(nonce) {
  const signedAt = Date.now();
  const payload = ['v2', deviceKey.deviceId, 'gateway-client', 'backend', 'operator', SCOPES.join(','), String(signedAt), CONFIG.gatewayToken, nonce || ''].join('|');
  const signature = ed25519Sign(null, Buffer.from(payload, 'utf8'), devicePrivateKey).toString('base64url');
  return {
    type: 'req',
    id: `connect-${randomUUID()}`,
    method: 'connect',
    params: {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'gateway-client', version: '1.0.0', platform: 'web', mode: 'backend' },
      role: 'operator',
      scopes: SCOPES,
      caps: [],
      auth: { token: CONFIG.gatewayToken },
      device: { id: deviceKey.deviceId, publicKey: deviceKey.publicKey, signedAt, nonce, signature },
      locale: 'zh-CN',
      userAgent: 'OpenClaw-Mobile-Proxy/1.0.0',
    },
  };
}

/** 验证 token */
function validateToken(token) {
  if (!CONFIG.proxyToken) return true;
  return token === CONFIG.proxyToken;
}

/** 向 SSE 客户端推送事件 */
function sseWrite(session, event, data) {
  session.eventSeq++;
  const entry = { id: session.eventSeq, event, data };
  // 缓存用于断线续传
  session.eventBuffer.push(entry);
  if (session.eventBuffer.length > EVENT_BUFFER_MAX) {
    session.eventBuffer.shift();
  }
  // 如果 SSE 连接存在，立即推送
  if (session.sseRes && !session.sseRes.writableEnded) {
    session.sseRes.write(`id: ${entry.id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

/** 清理会话 */
function cleanupSession(sid) {
  const session = sessions.get(sid);
  if (!session) return;
  log.info(`清理会话: ${sid}`);
  if (session._heartbeat) clearInterval(session._heartbeat);
  if (session._sseHeartbeat) clearInterval(session._sseHeartbeat);
  if (session._connectTimer) clearTimeout(session._connectTimer);
  if (session._lingerTimer) clearTimeout(session._lingerTimer);
  if (session.sseRes && !session.sseRes.writableEnded) {
    session.sseRes.end();
  }
  if (session.upstream && session.upstream.readyState !== WebSocket.CLOSED) {
    session.upstream.close();
  }
  // reject 所有 pending 请求
  for (const [, cb] of session.pendingRequests) {
    clearTimeout(cb.timer);
    cb.reject(new Error('会话已关闭'));
  }
  session.pendingRequests.clear();
  sessions.delete(sid);
}

/**
 * 处理上游消息（Gateway → 代理服务端）
 */
function handleUpstreamMessage(sid, rawData) {
  const session = sessions.get(sid);
  if (!session) return;

  const str = typeof rawData === 'string' ? rawData : rawData.toString();
  session.lastActivity = Date.now();

  // 已连接状态：解析后推送 SSE（需要知道 event 类型）
  if (session.state === 'connected') {
    let msg;
    try { msg = JSON.parse(str); } catch { return; }

    // RPC 响应 → 匹配 pendingRequests
    if (msg.type === 'res') {
      const cb = session.pendingRequests.get(msg.id);
      log.debug(`RPC 响应 [${sid}] id=${msg.id} ok=${msg.ok} matched=${!!cb} pending=${session.pendingRequests.size}`);
      if (cb) {
        session.pendingRequests.delete(msg.id);
        clearTimeout(cb.timer);
        if (msg.ok) cb.resolve(msg.payload);
        else cb.reject(new Error(msg.error?.message || msg.error?.code || '请求失败'));
      }
      return;
    }

    // 事件 → 推送 SSE（统一用 message 事件名，原始事件类型在 data 中）
    if (msg.type === 'event') {
      log.debug(`SSE 推送 [${sid}] event=${msg.event} stream=${msg.payload?.stream} phase=${msg.payload?.data?.phase} state=${msg.payload?.state}`);
      sseWrite(session, 'message', msg);
    }
    return;
  }

  // 握手阶段：需要解析处理
  let message;
  try { message = JSON.parse(str); } catch { return; }

  log.debug(`上游消息 [${sid}] type=${message.type} event=${message.event}`);

  // connect.challenge
  if (message.type === 'event' && message.event === 'connect.challenge') {
    log.info(`收到 connect.challenge [${sid}]`);
    if (session._connectTimer) { clearTimeout(session._connectTimer); session._connectTimer = null; }
    const nonce = message.payload?.nonce || '';
    const connectFrame = createConnectFrame(nonce);
    if (session.upstream?.readyState === WebSocket.OPEN) {
      session.upstream.send(JSON.stringify(connectFrame));
    }
    return;
  }

  // connect 响应
  if (message.type === 'res' && message.id?.startsWith('connect-')) {
    if (!message.ok || message.error) {
      log.error(`Gateway 握手失败 [${sid}]:`, message.error || '未知错误');
      session._connectReject?.(new Error(message.error?.message || 'Gateway 握手失败'));
    } else {
      log.info(`Gateway 握手成功 [${sid}]`);
      session.state = 'connected';
      session.hello = message.payload;
      session.snapshot = message.payload?.snapshot || null;
      // 发送缓存消息
      for (const msg of session._pendingMessages) {
        if (session.upstream?.readyState === WebSocket.OPEN) session.upstream.send(msg);
      }
      session._pendingMessages = [];
      session._connectResolve?.();
    }
    return;
  }
}

/**
 * 建立到 Gateway 的上游 WS 连接，返回 Promise（握手完成后 resolve）
 */
function connectToGateway(sid) {
  const session = sessions.get(sid);
  if (!session) return Promise.reject(new Error('会话不存在'));

  return new Promise((resolve, reject) => {
    session._connectResolve = resolve;
    session._connectReject = reject;

    log.info(`连接到 Gateway: ${CONFIG.gatewayUrl} [${sid}]`);
    const upstream = new WebSocket(CONFIG.gatewayUrl, {
      headers: { 'Origin': CONFIG.gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://') },
    });
    session.upstream = upstream;
    session.state = 'connecting';

    upstream.on('open', () => {
      log.info(`上游连接已建立 [${sid}]`);
      // 等 500ms 看是否收到 challenge
      session._connectTimer = setTimeout(() => {
        if (session.state === 'connecting') {
          log.info(`未收到 challenge，直接发送 connect [${sid}]`);
          upstream.send(JSON.stringify(createConnectFrame('')));
        }
      }, 500);
    });

    upstream.on('message', (data) => handleUpstreamMessage(sid, data.toString()));

    upstream.on('close', (code, reason) => {
      log.warn(`上游连接关闭 [${sid}] code=${code}`);
      if (session.state !== 'connected') {
        reject(new Error(`Gateway 连接关闭: ${code}`));
      } else {
        // 已连接状态下断开，通知 SSE 客户端
        sseWrite(session, 'proxy.disconnect', { message: 'Gateway 连接已断开', code });
        cleanupSession(sid);
      }
    });

    upstream.on('error', (error) => {
      log.error(`上游连接错误 [${sid}]:`, error.message);
      if (session.state !== 'connected') {
        reject(new Error(`Gateway 连接错误: ${error.message}`));
      }
    });

    // 上游心跳（保持 Gateway 连接）
    session._heartbeat = setInterval(() => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.ping();
      }
    }, 30000);
  });
}

// ==================== Express 应用 ====================

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowedOrigins = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    `http://localhost:${CONFIG.port}`, `http://127.0.0.1:${CONFIG.port}`,
    ...extraOrigins,
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    config: {
      port: CONFIG.port,
      gatewayUrl: CONFIG.gatewayUrl,
      hasProxyToken: !!CONFIG.proxyToken,
      hasGatewayToken: !!CONFIG.gatewayToken,
    }
  });
});

// 媒体文件代理
app.get('/media', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !existsSync(filePath)) return res.status(404).send('Not Found');
  if (!filePath.startsWith('/tmp/') && !filePath.startsWith('/var/folders/')) return res.status(403).send('Forbidden');
  const stat = statSync(filePath);
  const ext = filePath.split('.').pop().toLowerCase();
  const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] || 'application/octet-stream';
  res.set({ 'Content-Type': mime, 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=3600' });
  createReadStream(filePath).pipe(res);
});

// ==================== API 路由 ====================

/** POST /api/connect — 建立会话 */
app.post('/api/connect', async (req, res) => {
  const { token } = req.body || {};
  if (!validateToken(token)) {
    return res.status(401).json({ ok: false, error: '认证失败：无效的 token' });
  }

  const sid = randomUUID();
  const session = {
    token,
    upstream: null,
    state: 'init',
    sseRes: null,
    eventBuffer: [],
    eventSeq: 0,
    pendingRequests: new Map(),
    snapshot: null,
    hello: null,
    lastActivity: Date.now(),
    _pendingMessages: [],
    _connectTimer: null,
    _connectResolve: null,
    _connectReject: null,
    _heartbeat: null,
    _lingerTimer: null,
    _sseHeartbeat: null,
  };
  sessions.set(sid, session);

  try {
    // 连接 Gateway，失败时重试
    let lastError;
    for (let attempt = 1; attempt <= GATEWAY_RETRY_COUNT; attempt++) {
      try {
        const timeout = setTimeout(() => {
          session._connectReject?.(new Error('连接超时'));
        }, CONNECT_TIMEOUT);

        await connectToGateway(sid);
        clearTimeout(timeout);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        // 清理失败的上游连接，保留 session 壳子用于重试
        if (session._heartbeat) { clearInterval(session._heartbeat); session._heartbeat = null; }
        if (session._connectTimer) { clearTimeout(session._connectTimer); session._connectTimer = null; }
        if (session.upstream && session.upstream.readyState !== WebSocket.CLOSED) {
          session.upstream.close();
        }
        session.upstream = null;
        session.state = 'init';
        session.pendingRequests.clear();

        if (attempt < GATEWAY_RETRY_COUNT) {
          log.warn(`Gateway 连接失败 [${sid}] 第${attempt}次，${GATEWAY_RETRY_DELAY}ms 后重试: ${e.message}`);
          await new Promise(r => setTimeout(r, GATEWAY_RETRY_DELAY));
        }
      }
    }

    if (lastError) throw lastError;

    const defaults = session.snapshot?.sessionDefaults;
    const sessionKey = defaults?.mainSessionKey || `agent:${defaults?.defaultAgentId || 'main'}:main`;

    log.info(`会话建立成功 [${sid}]`);
    res.json({ ok: true, sid, snapshot: session.snapshot, hello: session.hello, sessionKey });
  } catch (e) {
    log.error(`会话建立失败 [${sid}]:`, e.message);
    cleanupSession(sid);
    res.status(502).json({ ok: false, error: e.message });
  }
});

/** GET /api/events — SSE 事件流 */
app.get('/api/events', (req, res) => {
  const sid = req.query.sid;
  const session = sessions.get(sid);
  if (!session) {
    return res.status(404).json({ ok: false, error: '会话不存在' });
  }

  // SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // 关闭旧 SSE 连接（如果有）
  if (session.sseRes && !session.sseRes.writableEnded) {
    session.sseRes.end();
  }
  if (session._sseHeartbeat) {
    clearInterval(session._sseHeartbeat);
  }

  session.sseRes = res;
  session.lastActivity = Date.now();

  // 清除 linger 定时器（SSE 重连了，不需要清理上游）
  if (session._lingerTimer) {
    clearTimeout(session._lingerTimer);
    session._lingerTimer = null;
  }

  // 断线续传：补发 Last-Event-ID 之后的事件
  const lastId = parseInt(req.headers['last-event-id'], 10);
  if (lastId && session.eventBuffer.length > 0) {
    const missed = session.eventBuffer.filter(e => e.id > lastId);
    for (const entry of missed) {
      res.write(`id: ${entry.id}\nevent: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`);
    }
    log.info(`SSE 续传 [${sid}] 补发 ${missed.length} 条事件 (from id=${lastId})`);
  }

  // 发送连接确认事件
  res.write(`event: proxy.ready\ndata: ${JSON.stringify({ sid, state: session.state })}\n\n`);

  // SSE 心跳（防止代理/CDN 超时）
  session._sseHeartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, SSE_HEARTBEAT_INTERVAL);

  // SSE 连接关闭
  res.on('close', () => {
    log.info(`SSE 连接关闭 [${sid}]`);
    if (session._sseHeartbeat) {
      clearInterval(session._sseHeartbeat);
      session._sseHeartbeat = null;
    }
    session.sseRes = null;

    // 启动 linger 定时器：SSE 断开后上游保持一段时间
    session._lingerTimer = setTimeout(() => {
      const s = sessions.get(sid);
      if (s && !s.sseRes) {
        log.info(`SSE 未重连，清理会话 [${sid}]`);
        cleanupSession(sid);
      }
    }, UPSTREAM_LINGER);
  });
});

/** POST /api/send — 发送请求（RPC 转发） */
app.post('/api/send', async (req, res) => {
  const { sid, method, params } = req.body || {};
  const session = sessions.get(sid);
  if (!session) {
    return res.status(404).json({ ok: false, error: '会话不存在' });
  }
  if (session.state !== 'connected') {
    return res.status(400).json({ ok: false, error: '会话未就绪' });
  }
  if (!session.upstream || session.upstream.readyState !== WebSocket.OPEN) {
    return res.status(502).json({ ok: false, error: 'Gateway 连接已断开' });
  }

  session.lastActivity = Date.now();
  const reqId = `rpc-${randomUUID()}`;

  log.info(`RPC 请求 [${sid}] id=${reqId} method=${method}`);
  const frame = { type: 'req', id: reqId, method, params };

  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(reqId);
        reject(new Error('请求超时'));
      }, REQUEST_TIMEOUT);

      session.pendingRequests.set(reqId, { resolve, reject, timer });
      session.upstream.send(JSON.stringify(frame));
    });

    res.json({ ok: true, payload: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/disconnect — 断开会话 */
app.post('/api/disconnect', (req, res) => {
  const { sid } = req.body || {};
  const session = sessions.get(sid);
  if (!session) {
    return res.json({ ok: true });
  }
  cleanupSession(sid);
  res.json({ ok: true });
});

// ==================== 会话清理 ====================

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    // 有 SSE 连接的会话不清理
    if (session.sseRes && !session.sseRes.writableEnded) continue;
    // 空闲超时清理
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT) {
      log.info(`会话空闲超时，清理 [${sid}]`);
      cleanupSession(sid);
    }
  }
}, SESSION_CLEANUP_INTERVAL);

// ==================== 静态文件服务 ====================

// H5 前端静态文件
if (existsSync(CONFIG.h5DistPath)) {
  app.use(express.static(CONFIG.h5DistPath));
  // SPA fallback
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not Found' });
    res.sendFile(join(CONFIG.h5DistPath, 'index.html'));
  });
  log.info(`静态文件目录: ${CONFIG.h5DistPath}`);
} else {
  log.warn(`静态文件目录不存在: ${CONFIG.h5DistPath}`);
}

// ==================== 启动服务器 ====================

const server = createServer(app);

server.listen(CONFIG.port, () => {
  log.info(`代理服务端已启动: http://0.0.0.0:${CONFIG.port}`);
  log.info(`架构: 手机 ←SSE+POST→ 代理服务端 ←WS→ Gateway(${CONFIG.gatewayUrl})`);
  log.info(`设备 ID: ${deviceKey.deviceId.slice(0, 12)}...`);
});

// 优雅关闭
function shutdown() {
  log.info('正在关闭服务...');
  for (const [sid] of sessions) {
    cleanupSession(sid);
  }
  server.close(() => {
    log.info('服务已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
