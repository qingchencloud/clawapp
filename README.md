# OpenClaw Mobile

H5 移动端聊天客户端 + WebSocket 代理服务端，用于通过手机浏览器与 OpenClaw 智能体聊天。

## 架构

```
手机 H5 浏览器
    ↓ WebSocket (ws://<server>:3210/ws?token=xxx)
代理服务端 (Node.js, 0.0.0.0:3210)
    ├── 提供 H5 静态文件 (GET /)
    ├── WebSocket 代理 → OpenClaw Gateway
    └── 简单 token 认证
    ↓ WebSocket (ws://127.0.0.1:18789)
OpenClaw Gateway (loopback)
```

## 为什么需要代理服务端？

OpenClaw Gateway 默认绑定在 `127.0.0.1:18789`（loopback），手机无法直连。代理服务端解决了：

1. **网络穿透**：监听 `0.0.0.0:3210`，局域网内手机可直接访问
2. **协议桥接**：自动完成 OpenClaw WebSocket 握手（connect 帧 + 认证）
3. **静态文件服务**：同时提供 H5 前端页面
4. **安全隔离**：H5 端使用独立 token，不暴露 Gateway token

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

### 2. 配置

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入你的 OpenClaw Gateway token
```

### 3. 构建 H5

```bash
npm run build:h5
```

### 4. 启动

```bash
npm start
```

### 5. 手机访问

打开手机浏览器，访问 `http://<Mac-IP>:3210`

## 功能

- ✅ 与 OpenClaw 智能体实时聊天
- ✅ 流式响应（打字机效果）
- ✅ 图片发送（base64 附件）
- ✅ Markdown 渲染（代码块、列表、链接等）
- ✅ 快捷指令面板（/model、/help、/status、/think 等）
- ✅ 工具调用实时显示
- ✅ 深色主题，移动端优化
- ✅ 自动重连
- ✅ 连接设置页

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PROXY_PORT | 3210 | 代理服务端端口 |
| PROXY_TOKEN | (必填) | H5 客户端认证 token |
| OPENCLAW_GATEWAY_URL | ws://127.0.0.1:18789 | OpenClaw Gateway 地址 |
| OPENCLAW_GATEWAY_TOKEN | (必填) | OpenClaw Gateway 认证 token |

## 目录结构

```
openclaw-mobile/
├── server/           # WebSocket 代理服务端
│   ├── index.js      # 主入口
│   ├── package.json
│   └── .env.example
├── h5/               # H5 移动端前端
│   ├── src/
│   │   ├── main.js       # 入口
│   │   ├── ws-client.js  # WebSocket 协议层
│   │   ├── chat-ui.js    # 聊天 UI
│   │   ├── commands.js   # 快捷指令面板
│   │   ├── markdown.js   # Markdown 渲染
│   │   ├── media.js      # 图片处理
│   │   └── style.css     # 样式
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 许可证

MIT
