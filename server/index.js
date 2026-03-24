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
import { dirname, join, resolve, sep, basename, extname } from 'path';
import { randomUUID, randomBytes, generateKeyPairSync, createHash, sign as ed25519Sign, createPrivateKey } from 'crypto';
import { readFileSync, writeFileSync, existsSync, createReadStream, statSync, realpathSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = join(__dirname, '.env');

// 自动创建 .env（首次启动时生成临时密码，等待用户设置）
if (!existsSync(ENV_PATH)) {
  const tmpToken = randomBytes(12).toString('base64url');
  const content = [
    '# ClawApp 配置文件（自动生成）',
    'PROXY_PORT=3210',
    '',
    '# H5 客户端连接密码（登录时填写的 Token）',
    `PROXY_TOKEN=${tmpToken}`,
    '',
    '# 首次运行标记（用户设置密码后自动移除）',
    'SETUP_PENDING=true',
    '',
    '# OpenClaw Gateway 地址',
    'OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789',
    '',
    '# OpenClaw Gateway 认证 token',
    'OPENCLAW_GATEWAY_TOKEN=',
    '',
  ].join('\n');
  writeFileSync(ENV_PATH, content, 'utf8');
  console.log('[INFO] 首次启动，已创建配置文件，等待用户设置连接密码...');
}

// 加载环境变量
config({ path: ENV_PATH });

/** 检查是否首次运行（持久化标记） */
let _isFirstRun = process.env.SETUP_PENDING === 'true';

/** 更新 .env 中的 PROXY_TOKEN 并清除首次运行标记 */
function updateEnvToken(newToken) {
  let content = readFileSync(ENV_PATH, 'utf8');
  if (/^PROXY_TOKEN=.*/m.test(content)) {
    content = content.replace(/^PROXY_TOKEN=.*/m, `PROXY_TOKEN=${newToken}`);
  } else {
    content += `\nPROXY_TOKEN=${newToken}\n`;
  }
  // 移除首次运行标记
  content = content.replace(/^SETUP_PENDING=.*\n?/m, '');
  content = content.replace(/^# 首次运行标记.*\n?/m, '');
  writeFileSync(ENV_PATH, content, 'utf8');
  CONFIG.proxyToken = newToken;
}

// 配置
const DEFAULT_MEDIA_ALLOWED_DIRS = ['/tmp', '/var/folders'];

function expandHomePath(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (str === '~') return process.env.HOME || str;
  if (str.startsWith('~/')) return join(process.env.HOME || '', str.slice(2));
  return str;
}

function normalizePathForCompare(value, { mustExist = false } = {}) {
  const expanded = expandHomePath(value);
  if (!expanded) return '';
  try {
    if (existsSync(expanded)) {
      return realpathSync(expanded);
    }
  } catch {}
  if (mustExist) return '';
  return resolve(expanded);
}

function parseAllowedMediaDirs(value) {
  return String(value || '')
    .split(',')
    .map(part => normalizePathForCompare(part))
    .filter(Boolean);
}

function isPathInsideDir(targetPath, dirPath) {
  if (!targetPath || !dirPath) return false;
  return targetPath === dirPath || targetPath.startsWith(dirPath.endsWith(sep) ? dirPath : `${dirPath}${sep}`);
}

function buildContentDisposition(filename) {
  const originalName = String(filename || 'download')
    .replace(/[\r\n"]/g, '_')
    .trim() || 'download';
  const extension = extname(originalName);
  const baseName = originalName.slice(0, originalName.length - extension.length) || 'download';
  const asciiBaseName = baseName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[%;\\]/g, '_')
    .trim() || 'download';
  const asciiExtension = extension
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/[%;\\]/g, '') || '';
  const fallbackName = `${asciiBaseName}${asciiExtension}` || 'download';
  return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

const CONFIG = {
  port: parseInt(process.env.PROXY_PORT, 10) || 3210,
  proxyToken: process.env.PROXY_TOKEN || '',
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  gatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD || '',
  mediaAllowAll: process.env.MEDIA_ALLOW_ALL === '1',
  mediaAllowedDirs: [
    ...DEFAULT_MEDIA_ALLOWED_DIRS.map(dir => normalizePathForCompare(dir, { mustExist: false })),
    ...parseAllowedMediaDirs(process.env.MEDIA_ALLOWED_DIRS),
  ],
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

// Ed25519 Node 设备密钥（以 role:node 接受 system.notify 指令）
const NODE_DEVICE_KEY_PATH = join(__dirname, '.node-device-key.json');
const nodeDeviceKey = (() => {
  if (existsSync(NODE_DEVICE_KEY_PATH)) {
    return JSON.parse(readFileSync(NODE_DEVICE_KEY_PATH, 'utf8'));
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const dk = {
    deviceId: createHash('sha256').update(pubRaw).digest('hex'),
    publicKey: pubRaw.toString('base64url'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  writeFileSync(NODE_DEVICE_KEY_PATH, JSON.stringify(dk, null, 2));
  return dk;
})();
const nodeDevicePrivateKey = createPrivateKey(nodeDeviceKey.privateKeyPem);

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
const PROGRESS_STALE_TIMEOUT = 120000;

function setSessionProgress(session, patch = {}) {
  session.progress = {
    isBusy: session.progress?.isBusy || false,
    sessionKey: session.progress?.sessionKey || '',
    runId: session.progress?.runId || '',
    state: session.progress?.state || 'idle',
    updatedAt: Date.now(),
    ...patch,
  };
}

/**
 * 生成 connect 握手帧（含 Ed25519 device 签名）
 */
function createConnectFrame(nonce) {
  const signedAt = Date.now();
  const credential = CONFIG.gatewayPassword || CONFIG.gatewayToken;
  const payload = ['v2', deviceKey.deviceId, 'gateway-client', 'backend', 'operator', SCOPES.join(','), String(signedAt), credential, nonce || ''].join('|');
  const signature = ed25519Sign(null, Buffer.from(payload, 'utf8'), devicePrivateKey).toString('base64url');
  const auth = CONFIG.gatewayPassword
    ? { password: CONFIG.gatewayPassword }
    : { token: CONFIG.gatewayToken };
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
      auth,
      device: { id: deviceKey.deviceId, publicKey: deviceKey.publicKey, signedAt, nonce, signature },
      locale: 'zh-CN',
      userAgent: 'OpenClaw-Mobile-Proxy/1.0.0',
    },
  };
}

/**
 * 生成 Node 角色 connect 握手帧
 * mode=node 以支持 system.notify 指令
 */
function createNodeConnectFrame(nonce) {
  const signedAt = Date.now();
  const credential = CONFIG.gatewayPassword || CONFIG.gatewayToken;
  const payload = ['v2', nodeDeviceKey.deviceId, 'node-host', 'node', 'node', '', String(signedAt), credential, nonce || ''].join('|');
  const signature = ed25519Sign(null, Buffer.from(payload, 'utf8'), nodeDevicePrivateKey).toString('base64url');
  const auth = CONFIG.gatewayPassword
    ? { password: CONFIG.gatewayPassword }
    : { token: CONFIG.gatewayToken };
  return {
    type: 'req',
    id: `connect-node-${randomUUID()}`,
    method: 'connect',
    params: {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'node-host', version: '1.0.0', platform: 'linux', mode: 'node', displayName: 'ClawApp' },
      role: 'node',
      scopes: [],
      caps: ['system'],
      commands: ['system.notify'],
      auth,
      device: { id: nodeDeviceKey.deviceId, publicKey: nodeDeviceKey.publicKey, signedAt, nonce, signature },
      locale: 'zh-CN',
      userAgent: 'ClawApp-Node/1.0.0',
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
    if (typeof session.sseRes.flush === 'function') session.sseRes.flush();
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
      if (msg.event === 'chat') {
        const payload = msg.payload || {};
        const state = payload.state;
        if (state === 'delta') {
          setSessionProgress(session, {
            isBusy: true,
            sessionKey: payload.sessionKey || session.progress?.sessionKey || '',
            runId: payload.runId || session.progress?.runId || '',
            state: 'streaming',
          });
        } else if (state === 'final' || state === 'error' || state === 'aborted') {
          setSessionProgress(session, {
            isBusy: false,
            sessionKey: payload.sessionKey || session.progress?.sessionKey || '',
            runId: payload.runId || session.progress?.runId || '',
            state,
          });
        }
      }

      if (msg.event === 'agent') {
        const payload = msg.payload || {};
        const stream = payload.stream;
        const phase = payload.data?.phase;
        if (stream === 'lifecycle' && phase === 'start') {
          setSessionProgress(session, {
            isBusy: true,
            sessionKey: payload.sessionKey || session.progress?.sessionKey || '',
            runId: payload.runId || session.progress?.runId || '',
            state: 'lifecycle.start',
          });
        } else if (stream === 'lifecycle' && phase === 'end') {
          setSessionProgress(session, {
            isBusy: false,
            sessionKey: payload.sessionKey || session.progress?.sessionKey || '',
            runId: payload.runId || session.progress?.runId || '',
            state: 'lifecycle.end',
          });
        }
      }

      // node 设备配对请求 → 自动审批（允许 ClawApp node 设备接受 system.notify）
      if (msg.event === 'device.pair.requested' && msg.payload?.deviceId === nodeDeviceKey.deviceId) {
        const requestId = msg.payload.requestId;
        log.info(`[node] 自动审批 node 设备配对: requestId=${requestId}`);
        if (session.upstream?.readyState === WebSocket.OPEN) {
          session.upstream.send(JSON.stringify({
            type: 'req',
            id: `auto-approve-${randomUUID()}`,
            method: 'device.pair.approve',
            params: { requestId },
          }));
        }
        return;
      }

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

// ==================== Node 客户端（system.notify 接收端）====================

let _nodeWs = null;
let _nodeReady = false;
let _nodeReconnectTimer = null;

// -------- 后台 Operator 连接（专门用于自动审批 node 设备配对）--------
let _bgOpWs = null;
let _bgOpReady = false;
let _bgOpReconnectTimer = null;
let _bgOpReqSeq = 0;
const _bgOpPending = new Map(); // id → {resolve, reject, timer}

function bgOpRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!_bgOpReady || !_bgOpWs || _bgOpWs.readyState !== WebSocket.OPEN) {
      return reject(new Error('bgOp not ready'));
    }
    const id = `bgop-${++_bgOpReqSeq}`;
    const timer = setTimeout(() => { _bgOpPending.delete(id); reject(new Error('bgOp timeout')); }, 10000);
    _bgOpPending.set(id, { resolve, reject, timer });
    _bgOpWs.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

async function tryApproveNodeDevice() {
  try {
    const result = await bgOpRequest('device.pair.list', {});
    const pending = (result?.pending || []);
    const nodeReq = pending.find(r => r.deviceId === nodeDeviceKey.deviceId);
    if (nodeReq) {
      log.info(`[node-setup] 审批 node 设备 requestId=${nodeReq.requestId}`);
      await bgOpRequest('device.pair.approve', { requestId: nodeReq.requestId });
      log.info('[node-setup] 审批完成，1s 后触发 node 重连');
      if (_nodeReconnectTimer) clearTimeout(_nodeReconnectTimer);
      _nodeReconnectTimer = setTimeout(startNodeClient, 1000);
    }
  } catch (e) {
    log.warn('[node-setup] tryApproveNodeDevice 失败:', e.message);
  }
}

function startBgOperator() {
  if (_bgOpReconnectTimer) { clearTimeout(_bgOpReconnectTimer); _bgOpReconnectTimer = null; }
  log.info('[node-setup] 启动后台 operator 连接...');
  const ws = new WebSocket(CONFIG.gatewayUrl, {
    headers: { 'Origin': CONFIG.gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://') },
  });
  _bgOpWs = ws;
  _bgOpReady = false;

  let connTimer = null;
  ws.on('open', () => {
    connTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(createConnectFrame('')));
    }, 500);
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      if (connTimer) { clearTimeout(connTimer); connTimer = null; }
      ws.send(JSON.stringify(createConnectFrame(msg.payload?.nonce || '')));
      return;
    }

    if (msg.type === 'res' && String(msg.id).startsWith('connect-')) {
      if (msg.ok) {
        _bgOpReady = true;
        log.info('[node-setup] 后台 operator 就绪，检查 node 配对状态...');
        tryApproveNodeDevice();
      } else {
        log.warn('[node-setup] 后台 operator connect 失败:', msg.error?.message);
      }
      return;
    }

    if (msg.type === 'res') {
      const cb = _bgOpPending.get(msg.id);
      if (cb) {
        _bgOpPending.delete(msg.id);
        clearTimeout(cb.timer);
        if (msg.ok) cb.resolve(msg.payload);
        else cb.reject(new Error(msg.error?.message || 'error'));
      }
      return;
    }

    // 实时捕获 device.pair.requested
    if (msg.type === 'event' && msg.event === 'device.pair.requested' &&
        msg.payload?.deviceId === nodeDeviceKey.deviceId) {
      const requestId = msg.payload.requestId;
      log.info(`[node-setup] 实时审批 node 配对: ${requestId}`);
      bgOpRequest('device.pair.approve', { requestId })
        .then(() => {
          log.info('[node-setup] 实时审批完成，1s 后 node 重连');
          if (_nodeReconnectTimer) clearTimeout(_nodeReconnectTimer);
          _nodeReconnectTimer = setTimeout(startNodeClient, 1000);
        })
        .catch(e => log.warn('[node-setup] 实时审批失败:', e.message));
    }
  });

  ws.on('close', (code) => {
    if (_bgOpWs === ws) {
      _bgOpWs = null;
      _bgOpReady = false;
      for (const [, cb] of _bgOpPending) { clearTimeout(cb.timer); cb.reject(new Error('bgOp closed')); }
      _bgOpPending.clear();
      log.warn(`[node-setup] 后台 operator 关闭 code=${code}，15s 后重连`);
      _bgOpReconnectTimer = setTimeout(startBgOperator, 15000);
    }
  });

  ws.on('error', (err) => log.error('[node-setup] 后台 operator WS 错误:', err.message));
}

// 全局通知历史（持久化到文件，跨重启/跨设备可用）
const NOTIFY_HISTORY_PATH = join(__dirname, '.notify-history.json');
const NOTIFY_HISTORY_MAX = 50;
const NOTIFY_HISTORY_TTL = 24 * 60 * 60 * 1000; // 保留 24 小时

// 启动时从文件加载
const _notifyHistory = (() => {
  try {
    if (existsSync(NOTIFY_HISTORY_PATH)) {
      const arr = JSON.parse(readFileSync(NOTIFY_HISTORY_PATH, 'utf8'));
      const cutoff = Date.now() - NOTIFY_HISTORY_TTL;
      return Array.isArray(arr) ? arr.filter(n => n.sentAt > cutoff) : [];
    }
  } catch {}
  return [];
})();

function _saveNotifyHistory() {
  try {
    writeFileSync(NOTIFY_HISTORY_PATH, JSON.stringify(_notifyHistory), 'utf8');
  } catch (e) {
    log.warn('[notify] 历史写入失败:', e.message);
  }
}

/** 广播 system.notify 到所有 SSE 客户端，并持久化历史 */
function broadcastSystemNotify(payload) {
  const now = Date.now();
  _notifyHistory.push({ payload, sentAt: now });
  // 清理超期
  const cutoff = now - NOTIFY_HISTORY_TTL;
  while (_notifyHistory.length > 0 && _notifyHistory[0].sentAt < cutoff) _notifyHistory.shift();
  if (_notifyHistory.length > NOTIFY_HISTORY_MAX) _notifyHistory.splice(0, _notifyHistory.length - NOTIFY_HISTORY_MAX);
  _saveNotifyHistory();

  let count = 0;
  for (const [, session] of sessions) {
    if (session.sseRes && !session.sseRes.writableEnded) {
      sseWrite(session, 'message', { type: 'event', event: 'system.notify', payload });
      count++;
    }
  }
  log.info(`[node] system.notify 广播到 ${count} 个 SSE 连接`);
}

/** 启动 Node 客户端 */
function startNodeClient() {
  if (_nodeReconnectTimer) { clearTimeout(_nodeReconnectTimer); _nodeReconnectTimer = null; }

  log.info(`[node] 连接 Gateway 作为 node 角色...`);
  const ws = new WebSocket(CONFIG.gatewayUrl, {
    headers: { 'Origin': CONFIG.gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://') },
  });
  _nodeWs = ws;
  _nodeReady = false;

  let connectTimer = null;

  ws.on('open', () => {
    log.info('[node] WS 已连接，等待 challenge...');
    connectTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        log.info('[node] 未收到 challenge，直接发 connect');
        ws.send(JSON.stringify(createNodeConnectFrame('')));
      }
    }, 500);
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // connect.challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      ws.send(JSON.stringify(createNodeConnectFrame(msg.payload?.nonce || '')));
      return;
    }

    // connect 响应
    if (msg.type === 'res' && String(msg.id).startsWith('connect-node-')) {
      if (!msg.ok) {
        const code = msg.error?.code || '';
        const errMsg = msg.error?.message || '';
        log.warn(`[node] connect 失败: ${errMsg} (${code})`);
        // UNPAIRED → 等待 operator 侧 device.pair.requested 自动审批后重试
        if (code === 'UNPAIRED' || code === 'NOT_PAIRED' || errMsg.toLowerCase().includes('pair')) {
          log.info('[node] 等待配对审批，触发后台审批流程...');
          tryApproveNodeDevice();
          _nodeReconnectTimer = setTimeout(startNodeClient, 12000); // fallback
        }
        return;
      }
      _nodeReady = true;
      log.info(`[node] 就绪，node 设备 ID: ${nodeDeviceKey.deviceId.slice(0, 12)}...`);
      return;
    }

    // node.invoke.request → 执行 system.notify
    if (msg.type === 'event' && msg.event === 'node.invoke.request') {
      const frame = msg.payload || {};
      if (!frame.id || !frame.command) return;
      log.info(`[node] invoke: command=${frame.command}`);

      if (frame.command === 'system.notify') {
        let params = {};
        try { params = JSON.parse(frame.paramsJSON || '{}'); } catch {}
        broadcastSystemNotify({
          title: params.title || 'OpenClaw',
          body: params.body || '',
          sound: params.sound,
          priority: params.priority,
          delivery: params.delivery,
        });
        // 回复 Gateway
        ws.send(JSON.stringify({
          type: 'req',
          id: `inv-res-${randomUUID()}`,
          method: 'node.invoke.result',
          params: { id: frame.id, nodeId: frame.nodeId, ok: true, payload: { ok: true } },
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'req',
          id: `inv-res-${randomUUID()}`,
          method: 'node.invoke.result',
          params: { id: frame.id, nodeId: frame.nodeId, ok: false, error: { code: 'UNSUPPORTED', message: `not supported: ${frame.command}` } },
        }));
      }
      return;
    }
  });

  ws.on('close', (code) => {
    if (_nodeWs === ws) {
      _nodeWs = null;
      _nodeReady = false;
      log.warn(`[node] 连接关闭 code=${code}，5s 后重连`);
      _nodeReconnectTimer = setTimeout(startNodeClient, 5000);
    }
  });

  ws.on('error', (err) => {
    log.error('[node] WS 错误:', err.message);
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
    'https://localhost', 'https://127.0.0.1',
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
  const resolvedFilePath = normalizePathForCompare(filePath, { mustExist: true });
  if (!resolvedFilePath) return res.status(404).send('Not Found');
  if (!CONFIG.mediaAllowAll && !CONFIG.mediaAllowedDirs.some(dir => isPathInsideDir(resolvedFilePath, dir))) {
    return res.status(403).send('Forbidden');
  }
  const stat = statSync(resolvedFilePath);
  const ext = resolvedFilePath.split('.').pop().toLowerCase();
  const mime = {
    // 音频
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', wma: 'audio/x-ms-wma', opus: 'audio/opus',
    // 视频
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', flv: 'video/x-flv',
    // 图片
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif',
    // 文档
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv',
    // 压缩包
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
  }[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600',
  };
  if (req.query.download === '1') {
    headers['Content-Disposition'] = buildContentDisposition(basename(resolvedFilePath));
  }
  res.set(headers);
  createReadStream(resolvedFilePath).pipe(res);
});

// ==================== API 路由 ====================

/** GET /api/setup-hint — 仅 localhost 可访问，返回是否首次运行（不暴露 token） */
app.get('/api/setup-hint', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);
  if (!isLocal) {
    return res.status(403).json({ ok: false });
  }
  res.json({ ok: true, firstRun: _isFirstRun });
});

/** POST /api/setup — 首次运行设置密码（仅 localhost + firstRun） */
app.post('/api/setup', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip);
  if (!isLocal) {
    return res.status(403).json({ ok: false, error: '仅限本机访问' });
  }
  if (!_isFirstRun) {
    return res.status(400).json({ ok: false, error: '已完成初始设置' });
  }
  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ ok: false, error: '密码长度至少 4 位' });
  }
  updateEnvToken(password);
  _isFirstRun = false;
  log.info(`[setup] 用户已设置连接密码`);
  res.json({ ok: true, token: password });
});

/** POST /api/change-token — 修改连接密码（需当前 token 认证） */
app.post('/api/change-token', (req, res) => {
  const { currentToken, newToken } = req.body || {};
  if (!currentToken || !validateToken(currentToken)) {
    return res.status(401).json({ ok: false, error: '当前密码错误' });
  }
  if (!newToken || typeof newToken !== 'string' || newToken.length < 4) {
    return res.status(400).json({ ok: false, error: '新密码长度至少 4 位' });
  }
  updateEnvToken(newToken);
  log.info('[setup] 用户已修改连接密码');
  res.json({ ok: true });
});

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
    progress: {
      isBusy: false,
      sessionKey: '',
      runId: '',
      state: 'idle',
      updatedAt: Date.now(),
    },
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
    // 将技术错误映射为用户友好提示
    let userError = e.message;
    if (/ECONNREFUSED/.test(userError)) {
      userError = 'OpenClaw 服务未启动，请先在电脑上启动 OpenClaw 后再连接';
    } else if (/ETIMEDOUT|EHOSTUNREACH/.test(userError)) {
      userError = '无法连接到 OpenClaw 服务，请检查网络或 Gateway 地址配置';
    } else if (/连接超时/.test(userError)) {
      userError = '连接超时，请检查 OpenClaw 是否正在运行';
    } else if (/握手失败/.test(userError)) {
      userError = 'Gateway 认证失败，请检查 server/.env 中的 OPENCLAW_GATEWAY_TOKEN 配置';
    } else if (/too many.*auth|频率限制/.test(userError)) {
      userError = '认证尝试过于频繁，请等待几分钟后再试';
    }
    res.status(502).json({ ok: false, error: userError });
  }
});

/** GET /api/events — SSE 事件流 */
app.get('/api/events', (req, res) => {
  const sid = req.query.sid;
  const session = sessions.get(sid);
  if (!session) {
    return res.status(404).json({ ok: false, error: '会话不存在' });
  }

  // SSE 响应头（防止代理/Tunnel 缓冲）
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Content-Encoding': 'none',
  });
  res.flushHeaders();

  // 禁用 TCP Nagle 算法，确保小数据包立即发送
  if (req.socket) req.socket.setNoDelay(true);

  // 发送填充注释，触发代理/CDN 刷新初始缓冲区
  res.write(`: padding ${' '.repeat(2048)}\n\n`);

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
      if (typeof res.flush === 'function') res.flush();
    }
    log.info(`SSE 续传 [${sid}] 补发 ${missed.length} 条事件 (from id=${lastId})`);
  }

  // 发送连接确认事件
  res.write(`event: proxy.ready\ndata: ${JSON.stringify({ sid, state: session.state })}\n\n`);
  if (typeof res.flush === 'function') res.flush();

  // SSE 心跳（防止代理/CDN 超时）
  session._sseHeartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
      if (typeof res.flush === 'function') res.flush();
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

/** GET /api/progress — 查询会话执行状态（用于刷新后恢复 loading） */
app.get('/api/progress', (req, res) => {
  const sid = String(req.query.sid || '');
  const sessionKey = String(req.query.sessionKey || '');

  const toResponse = (sourceSid, progress) => {
    const now = Date.now();
    const updatedAt = Number(progress?.updatedAt || 0);
    const stale = updatedAt > 0 && (now - updatedAt > PROGRESS_STALE_TIMEOUT);
    const busy = !!progress?.isBusy && !stale;
    return res.json({
      ok: true,
      sid: sourceSid || '',
      sessionKey: progress?.sessionKey || sessionKey || '',
      busy,
      runId: progress?.runId || '',
      state: stale ? 'stale' : (progress?.state || 'idle'),
      updatedAt: updatedAt || now,
      stale,
    });
  };

  if (sid) {
    const session = sessions.get(sid);
    if (!session) return res.status(404).json({ ok: false, error: '会话不存在' });
    return toResponse(sid, session.progress || {});
  }

  if (sessionKey) {
    for (const [activeSid, session] of sessions) {
      if ((session.progress?.sessionKey || '') === sessionKey) {
        return toResponse(activeSid, session.progress || {});
      }
    }
    return res.json({
      ok: true,
      sid: '',
      sessionKey,
      busy: false,
      runId: '',
      state: 'idle',
      updatedAt: Date.now(),
      stale: false,
    });
  }

  return res.status(400).json({ ok: false, error: '缺少 sid 或 sessionKey' });
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

  if (method === 'chat.send') {
    setSessionProgress(session, {
      isBusy: true,
      sessionKey: params?.sessionKey || session.progress?.sessionKey || '',
      runId: '',
      state: 'sending',
    });
  }

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

/** GET /api/node-id — 返回 node 设备 ID 供 AI 工具查询 */
app.get('/api/node-id', (req, res) => {
  res.json({ ok: true, nodeId: nodeDeviceKey.deviceId, nodeReady: _nodeReady });
});

/** GET /api/notify-history — 返回最近的 system.notify 历史（供刷新后恢复） */
app.get('/api/notify-history', (req, res) => {
  const sid = req.query.sid;
  if (!sid || !sessions.has(sid)) {
    return res.status(401).json({ ok: false, error: '无效会话' });
  }
  const cutoff = Date.now() - NOTIFY_HISTORY_TTL;
  const items = _notifyHistory
    .filter(n => n.sentAt >= cutoff)
    .map(n => ({ ...n.payload, _sentAt: n.sentAt }));
  res.json({ ok: true, items });
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
  if (CONFIG.mediaAllowAll) {
    log.warn('媒体文件访问已全开放 (MEDIA_ALLOW_ALL=1)');
  } else {
    log.info(`媒体文件允许目录: ${CONFIG.mediaAllowedDirs.join(', ')}`);
  }
  if (_isFirstRun) {
    log.info('首次运行，请在浏览器中打开上述地址设置连接密码');
  } else if (CONFIG.proxyToken) {
    log.info('连接密码已配置');
  } else {
    log.warn('未设置连接密码 (PROXY_TOKEN)，请在 server/.env 中配置');
  }
  log.info(`operator 设备 ID: ${deviceKey.deviceId.slice(0, 12)}...`);
  log.info(`node 设备 ID: ${nodeDeviceKey.deviceId.slice(0, 12)}... (system.notify 接收端)`);
  // 先启动后台 operator（负责审批 node 设备配对），再延迟 2s 启动 node 客户端
  startBgOperator();
  setTimeout(startNodeClient, 2000);
});

// 优雅关闭
function shutdown() {
  log.info('正在关闭服务...');
  for (const [sid] of sessions) {
    cleanupSession(sid);
  }
  if (_nodeWs) { try { _nodeWs.close(); } catch {} }
  if (_nodeReconnectTimer) { clearTimeout(_nodeReconnectTimer); }
  if (_bgOpWs) { try { _bgOpWs.close(); } catch {} }
  if (_bgOpReconnectTimer) { clearTimeout(_bgOpReconnectTimer); }
  server.close(() => {
    log.info('服务已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
