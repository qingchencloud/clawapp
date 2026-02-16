/**
 * OpenClaw Mobile WebSocket 代理服务端
 * 
 * 功能：
 * - 接收来自 H5 客户端的 WebSocket 连接
 * - 将消息透明转发到 OpenClaw Gateway
 * - 提供 H5 静态文件服务
 * - 支持 token 认证
 */

import { config } from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

// 加载环境变量
config();

// ES Module 获取 __dirname
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

// 日志工具
const log = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args),
  debug: (msg, ...args) => process.env.DEBUG && console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`, ...args),
};

// 客户端连接管理
const clients = new Map(); // clientId -> { downstream, upstream, state }

// Express 应用
const app = express();

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: clients.size,
    config: {
      port: CONFIG.port,
      gatewayUrl: CONFIG.gatewayUrl,
      hasProxyToken: !!CONFIG.proxyToken,
      hasGatewayToken: !!CONFIG.gatewayToken,
    }
  });
});

// 静态文件服务（H5 构建产物）
app.use(express.static(CONFIG.h5DistPath));

// 所有其他路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(join(CONFIG.h5DistPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Not Found');
    }
  });
});

// HTTP 服务器
const server = createServer(app);

// WebSocket 服务端（监听 /ws 路径）
const wss = new WebSocketServer({ 
  server, 
  path: '/ws',
  clientTracking: false,
});

/**
 * 生成 connect 握手帧
 */
function createConnectFrame() {
  return {
    type: 'req',
    id: `connect-${randomUUID()}`,
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'h5-mobile',
        version: '1.0.0',
        platform: 'web',
        mode: 'operator',
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: { token: CONFIG.gatewayToken },
    },
  };
}

/**
 * 发送消息到 WebSocket
 */
function sendMessage(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    ws.send(payload);
    return true;
  }
  return false;
}

/**
 * 清理客户端连接
 */
function cleanupClient(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  log.info(`清理客户端连接: ${clientId}`);

  // 关闭下游连接
  if (client.downstream && client.downstream.readyState !== WebSocket.CLOSED) {
    client.downstream.close();
  }

  // 关闭上游连接
  if (client.upstream && client.upstream.readyState !== WebSocket.CLOSED) {
    client.upstream.close();
  }

  clients.delete(clientId);
}

/**
 * 处理上游消息
 */
function handleUpstreamMessage(clientId, data) {
  const client = clients.get(clientId);
  if (!client) return;

  let message;
  try {
    message = JSON.parse(data);
  } catch (e) {
    // 非 JSON 消息直接转发
    sendMessage(client.downstream, data);
    return;
  }

  log.debug(`上游消息 [${clientId}]:`, message.type || 'unknown');

  // 处理 connect.challenge 事件
  if (message.type === 'event' && message.event === 'connect.challenge') {
    log.info(`收到 connect.challenge，准备发送 connect 握手帧 [${clientId}]`);
    if (client._connectTimer) {
      clearTimeout(client._connectTimer);
      client._connectTimer = null;
    }
    const connectFrame = createConnectFrame();
    sendMessage(client.upstream, connectFrame);
    return;
  }

  // 处理 connect 响应
  if (message.type === 'res' && message.id?.startsWith('connect-')) {
    if (message.error) {
      log.error(`Gateway 握手失败 [${clientId}]:`, message.error);
      // 通知下游
      sendMessage(client.downstream, {
        type: 'event',
        event: 'proxy.error',
        data: { message: 'Gateway 握手失败', error: message.error },
      });
    } else {
      log.info(`Gateway 握手成功 [${clientId}]`);
      client.state = 'connected';
      sendMessage(client.downstream, {
        type: 'event',
        event: 'proxy.ready',
        data: { message: '已连接到 OpenClaw Gateway' },
      });
      // 发送握手期间缓存的消息
      if (client._pendingMessages.length > 0) {
        log.info(`发送 ${client._pendingMessages.length} 条缓存消息 [${clientId}]`);
        for (const msg of client._pendingMessages) {
          sendMessage(client.upstream, msg);
        }
        client._pendingMessages = [];
      }
    }
    return;
  }

  // 其他消息透传给下游
  sendMessage(client.downstream, data);
}

/**
 * 建立到 OpenClaw Gateway 的上游连接
 */
function connectToGateway(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  log.info(`连接到 Gateway: ${CONFIG.gatewayUrl} [${clientId}]`);

  const upstream = new WebSocket(CONFIG.gatewayUrl);
  client.upstream = upstream;
  client.state = 'connecting';

  upstream.on('open', () => {
    log.info(`上游连接已建立 [${clientId}]`);
    // 等待短暂时间看是否收到 challenge，否则直接发送 connect
    client._connectTimer = setTimeout(() => {
      if (client.state === 'connecting') {
        log.info(`未收到 challenge，直接发送 connect 握手帧 [${clientId}]`);
        const connectFrame = createConnectFrame();
        sendMessage(upstream, connectFrame);
      }
    }, 500);
  });

  upstream.on('message', (data) => {
    handleUpstreamMessage(clientId, data.toString());
  });

  upstream.on('close', (code, reason) => {
    log.warn(`上游连接关闭 [${clientId}] code=${code} reason=${reason || '无'}`);
    // 通知下游
    sendMessage(client.downstream, {
      type: 'event',
      event: 'proxy.disconnect',
      data: { message: 'Gateway 连接已断开', code, reason: reason?.toString() },
    });
    cleanupClient(clientId);
  });

  upstream.on('error', (error) => {
    log.error(`上游连接错误 [${clientId}]:`, error.message);
    // 通知下游
    sendMessage(client.downstream, {
      type: 'event',
      event: 'proxy.error',
      data: { message: 'Gateway 连接错误', error: error.message },
    });
  });
}

/**
 * 验证 token
 */
function validateToken(token) {
  if (!CONFIG.proxyToken) {
    // 未配置 token 时允许所有连接
    return true;
  }
  return token === CONFIG.proxyToken;
}

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  const clientId = randomUUID();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  log.info(`新的下游连接 [${clientId}] from ${req.socket.remoteAddress}`);

  // Token 验证
  if (!validateToken(token)) {
    log.warn(`Token 验证失败 [${clientId}]`);
    ws.send(JSON.stringify({
      type: 'event',
      event: 'proxy.error',
      data: { message: '认证失败：无效的 token' },
    }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  // 创建客户端记录
  const client = {
    downstream: ws,
    upstream: null,
    state: 'init',
    connectedAt: new Date(),
    _connectTimer: null,
    _pendingMessages: [],
  };
  clients.set(clientId, client);

  // 发送欢迎消息
  sendMessage(ws, {
    type: 'event',
    event: 'proxy.connected',
    data: { message: '已连接到代理服务', clientId },
  });

  // 建立上游连接
  connectToGateway(clientId);

  // 下游消息处理
  ws.on('message', (data) => {
    const client = clients.get(clientId);
    if (!client || !client.upstream) {
      log.warn(`收到消息但上游未就绪 [${clientId}]`);
      return;
    }

    // 只有在已连接状态下才转发消息
    if (client.state !== 'connected') {
      log.debug(`等待握手完成，缓存消息 [${clientId}]`);
      client._pendingMessages.push(data.toString());
      return;
    }

    log.debug(`下游消息 [${clientId}]: ${data.toString().substring(0, 100)}...`);
    
    // 透传给上游
    sendMessage(client.upstream, data.toString());
  });

  ws.on('close', (code, reason) => {
    log.info(`下游连接关闭 [${clientId}] code=${code} reason=${reason || '无'}`);
    cleanupClient(clientId);
  });

  ws.on('error', (error) => {
    log.error(`下游连接错误 [${clientId}]:`, error.message);
    cleanupClient(clientId);
  });
});

// 优雅关闭
function shutdown() {
  log.info('正在关闭服务...');

  // 关闭所有客户端连接
  for (const [clientId] of clients) {
    cleanupClient(clientId);
  }

  // 关闭 WebSocket 服务端
  wss.close(() => {
    log.info('WebSocket 服务已关闭');
  });

  // 关闭 HTTP 服务器
  server.close(() => {
    log.info('HTTP 服务已关闭');
    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    log.warn('强制退出');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 启动服务
server.listen(CONFIG.port, '0.0.0.0', () => {
  log.info(`OpenClaw Mobile 代理服务已启动`);
  log.info(`- 监听地址: 0.0.0.0:${CONFIG.port}`);
  log.info(`- WebSocket 路径: /ws?token=xxx`);
  log.info(`- Gateway 地址: ${CONFIG.gatewayUrl}`);
  log.info(`- H5 静态目录: ${CONFIG.h5DistPath}`);
  log.info(`- 健康检查: http://localhost:${CONFIG.port}/health`);
});
