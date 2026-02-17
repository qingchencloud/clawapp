# ClawApp

<p align="center">
  <strong>📱 用手机浏览器和你的 OpenClaw AI 智能体聊天</strong>
</p>

<p align="center">
  <a href="#features">功能特性</a> •
  <a href="#screenshots">截图预览</a> •
  <a href="#quickstart">快速开始</a> •
  <a href="#deploy">部署方式</a> •
  <a href="#remote">外网访问</a> •
  <a href="#config">配置参数</a> •
  <a href="#faq">常见问题</a> •
  <a href="#english">English</a>
</p>

<p align="center">
  <a href="https://clawapp.qt.cool">🌐 产品主页</a> •
  <a href="https://github.com/1186258278/OpenClawChineseTranslation">🇨🇳 OpenClaw 中文汉化版</a>
</p>

---

<h2 id="about">这是什么？</h2>

[OpenClaw](https://github.com/openclaw/openclaw) 是一个强大的 AI 智能体平台（[中文汉化版](https://github.com/1186258278/OpenClawChineseTranslation)），但它的 Gateway 默认只监听本机（`127.0.0.1:18789`），手机无法直接连接。

ClawApp 解决了这个问题：

```
手机浏览器（任意网络）
    ↓ WebSocket (WS / WSS)
代理服务端（ClawApp Server，端口 3210）
    ↓ WebSocket (localhost)
OpenClaw Gateway（端口 18789）
```

代理服务端自动完成 Gateway 握手认证，同时提供 H5 聊天页面，打开就能用，不需要装 App。

---

<h2 id="features">功能特性</h2>

- 💬 实时流式聊天（打字机效果）
- 📷 图片发送
- 📝 Markdown 渲染 + 代码高亮
- ⚡ 快捷指令面板（/model、/think、/new 等）
- 🔧 工具调用实时状态显示
- 📋 会话管理（切换、新建、删除）
- 🌙 主题切换（亮色 / 暗色 / 跟随系统）
- 🌐 中英文切换
- 🔄 自动重连 + 心跳保活
- 🔒 Token 认证
- 👋 新用户功能引导
- 📱 PWA 支持（添加到主屏幕，离线可用）
- 📦 Android APK 打包（Capacitor + GitHub Actions 自动构建）

---

<h2 id="screenshots">截图预览</h2>

<table align="center">
  <tr>
    <td align="center"><img src="docs/image/login-page.png" width="220" alt="登录页" /><br/><sub>登录连接</sub></td>
    <td align="center"><img src="docs/image/chat-response.png" width="220" alt="AI 聊天回复" /><br/><sub>流式聊天</sub></td>
    <td align="center"><img src="docs/image/chat-commands.jpg" width="220" alt="快捷指令面板" /><br/><sub>快捷指令</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/image/session-manager.jpg" width="220" alt="会话管理" /><br/><sub>会话管理</sub></td>
    <td align="center"><img src="docs/image/commands-panel.png" width="220" alt="指令面板" /><br/><sub>指令面板</sub></td>
    <td align="center"><img src="docs/image/settings-panel.jpg" width="220" alt="设置面板" /><br/><sub>设置与帮助</sub></td>
  </tr>
</table>

---

<h2 id="quickstart">快速开始</h2>

### 前提条件

- 电脑上已运行 [OpenClaw](https://github.com/openclaw/openclaw) Gateway（默认端口 18789）
  - 推荐使用 [中文汉化版](https://github.com/1186258278/OpenClawChineseTranslation)
- 安装了 [Node.js](https://nodejs.org/) 18+ 或 [Docker](https://www.docker.com/)

### 方式一：Docker 部署（推荐）

```bash
git clone https://github.com/qingchencloud/clawapp.git
cd clawapp
```

在项目根目录创建 `.env` 文件：

```bash
# 手机连接时的密码（自己设一个）
PROXY_TOKEN=my-secret-token-123

# OpenClaw Gateway 的 Token（在 ~/.openclaw/gateway.yaml 里找）
OPENCLAW_GATEWAY_TOKEN=你的gateway-token
```

启动：

```bash
docker compose up -d --build
```

### 方式二：直接运行

```bash
git clone https://github.com/qingchencloud/clawapp.git
cd clawapp
npm run install:all
npm run build:h5
cp server/.env.example server/.env
# 编辑 server/.env，填入你的 token
npm start
```

### 手机访问

1. 确保手机和电脑在同一 WiFi
2. 查看电脑 IP：
   - Mac: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Windows: `ipconfig`
   - Linux: `ip addr`
3. 手机浏览器打开 `http://你的电脑IP:3210`
4. 填入服务器地址和 Token，点击连接

---

<h2 id="deploy">部署方式</h2>

### 本地部署（同一网络）

适合家庭/办公室使用，手机和电脑在同一 WiFi 下。

```bash
git clone https://github.com/qingchencloud/clawapp.git
cd clawapp && npm run install:all
npm run build:h5
cp server/.env.example server/.env
# 编辑 server/.env 填入 token
npm start
```

### Docker 容器部署

```bash
# 创建 .env
cat > .env << 'EOF'
PROXY_TOKEN=my-token-123
OPENCLAW_GATEWAY_TOKEN=你的gateway-token
ALLOWED_ORIGINS=
EOF

# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f
```

Docker 环境下会自动使用 `host.docker.internal` 连接宿主机的 Gateway。

### 使用 PM2 常驻运行

```bash
# 安装 pm2
npm install -g pm2

# 启动
pm2 start server/index.js --name clawapp

# 开机自启
pm2 save && pm2 startup
```

---

<h2 id="remote">外网访问</h2>

不在同一网络时，有以下方案：

### 方案一：SSH 隧道（简单快速）

需要一台有公网 IP 的服务器。

```bash
# 在你的电脑上执行
ssh -f -N \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=4 \
  -R 0.0.0.0:3210:127.0.0.1:3210 \
  user@你的服务器IP
```

> ⚠️ 服务器需要：
> - `/etc/ssh/sshd_config` 中设置 `GatewayPorts yes`
> - 防火墙放行 3210 端口

手机访问 `http://服务器IP:3210`

### 方案二：Cloudflare Tunnel（免费，无需公网 IP）

```bash
# 安装
brew install cloudflared  # Mac
# Linux: https://github.com/cloudflare/cloudflared/releases

# 一键穿透（临时域名）
cloudflared tunnel --url http://localhost:3210
```

会输出一个 `https://xxx.trycloudflare.com` 地址，手机直接访问即可。WebSocket 自动走 WSS 加密。

> 固定域名需要 Cloudflare 账号 + 自有域名，详见 [Cloudflare Tunnel 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

### 方案三：Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name clawapp.你的域名.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| SSH 隧道 | 简单，无需额外软件 | 需要公网服务器，隧道可能断开 |
| Cloudflare Tunnel | 免费，自动 HTTPS，稳定 | 依赖 Cloudflare 服务 |
| Nginx 反代 | 完全可控，自定义域名 | 需要服务器 + SSL 配置 |
| Tailscale/ZeroTier | P2P 直连，加密 | 手机也要装客户端 |

---

<h2 id="connection">连接说明</h2>

打开 H5 页面后会看到连接设置页：

| 字段 | 填什么 | 示例 |
|------|--------|------|
| 服务器地址 | 代理服务端的地址和端口 | `192.168.1.100:3210`（局域网）或 `服务器IP:3210`（外网） |
| Token | `.env` 里设置的 `PROXY_TOKEN` | `my-secret-token-123` |

> 💡 通过 HTTPS 访问时（如 Cloudflare Tunnel），WebSocket 会自动切换为 WSS 加密连接。

### H5 客户端设置

点击聊天页右上角 ⚙️ 图标：

- **主题**：浅色 / 深色 / 跟随系统
- **语言**：中文 / English
- **断开连接**：返回连接页

---

<h2 id="config">配置参数</h2>

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `PROXY_PORT` | 否 | `3210` | 代理服务端端口 |
| `PROXY_TOKEN` | **是** | - | H5 客户端连接密码 |
| `OPENCLAW_GATEWAY_URL` | 否 | `ws://127.0.0.1:18789` | Gateway 地址（Docker 下自动设为 `host.docker.internal`） |
| `OPENCLAW_GATEWAY_TOKEN` | **是** | - | Gateway 认证 token |
| `ALLOWED_ORIGINS` | 否 | - | 额外 CORS 白名单，逗号分隔 |

---

<h2 id="structure">项目结构</h2>

```
clawapp/
├── server/                # WebSocket 代理服务端
│   ├── index.js           # Express + WS 代理 + Gateway 握手
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── h5/                    # H5 移动端前端
│   ├── src/
│   │   ├── main.js        # 入口 + 连接页
│   │   ├── ws-client.js   # WebSocket 协议层
│   │   ├── chat-ui.js     # 聊天 UI + 会话管理
│   │   ├── commands.js    # 快捷指令面板
│   │   ├── markdown.js    # Markdown 渲染 + 代码高亮
│   │   ├── media.js       # 图片处理
│   │   ├── i18n.js        # 国际化（中文 / English）
│   │   ├── theme.js       # 主题管理（亮/暗/自动）
│   │   ├── settings.js    # 设置面板
│   │   ├── style.css      # 主样式 + 主题变量
│   │   └── components.css # 组件样式
│   ├── index.html
│   └── vite.config.js
├── android/               # Capacitor Android 项目
├── .github/workflows/     # GitHub Actions
│   └── build-apk.yml      # 自动构建 APK
├── docs/                  # 文档 + GitHub Pages
│   ├── index.html         # 产品落地页
│   ├── pwa-and-apk-guide.md  # PWA/APK 打包指南
│   └── image/             # 截图
├── capacitor.config.ts    # Capacitor 配置
├── Dockerfile             # 多阶段构建
├── docker-compose.yml     # 生产部署
└── README.md
```

---

<h2 id="dev">开发</h2>

```bash
# 安装依赖
npm run install:all

# H5 开发服务器（热更新，端口 5173）
npm run dev:h5

# 代理服务端（端口 3210）
npm run dev:server
```

---

<h2 id="faq">常见问题</h2>

**Q: 一直显示「连接中」？**

1. 检查 OpenClaw Gateway 是否在运行：`curl http://localhost:18789`
2. 确认 `OPENCLAW_GATEWAY_TOKEN` 正确
3. Docker 部署时，Gateway 地址应为 `ws://host.docker.internal:18789`

**Q: 手机打不开页面？**

1. 手机和电脑是否在同一 WiFi？
2. 电脑防火墙是否放行了 3210 端口？
3. 地址是否用了电脑 IP（不是 localhost）？

**Q: WebSocket 经常断开？**

服务端内置 30 秒心跳保活，客户端也有 25 秒应用层心跳。如果还是断，检查反向代理的超时配置（建议 > 60s）。SSH 隧道建议加 `-o ServerAliveInterval=15`。

**Q: 能多人同时使用吗？**

可以。每个连接创建独立的 Gateway 会话，但共享同一个 OpenClaw 实例。

**Q: 怎么添加更多语言？**

编辑 `h5/src/i18n.js`，添加新的语言包（如 `'ja'`），然后在 `settings.js` 中添加对应按钮。

---

<h2 id="security">安全建议</h2>

- 务必设置强 `PROXY_TOKEN`（建议 32 位以上随机字符串）
  ```bash
  openssl rand -hex 24
  ```
- Gateway Token 只在服务端 `.env` 中，不会暴露给客户端
- 公网访问建议使用 HTTPS（Cloudflare Tunnel 或 Nginx + SSL）
- 可选：使用 [Cloudflare Access](https://www.cloudflare.com/products/zero-trust/) 添加额外认证

---

<h2 id="related">相关项目</h2>

- [OpenClaw](https://github.com/openclaw/openclaw) - AI 智能体平台
- [OpenClaw 中文汉化版](https://github.com/1186258278/OpenClawChineseTranslation) - 社区汉化

---

<details id="english">
<summary><strong>English Documentation</strong></summary>

### What is this?

ClawApp is an H5 mobile chat client that lets you chat with your [OpenClaw](https://github.com/openclaw/openclaw) AI agent from any phone browser.

### Quick Start

**Docker:**
```bash
git clone https://github.com/qingchencloud/clawapp.git
cd clawapp
echo 'PROXY_TOKEN=your-token' > .env
echo 'OPENCLAW_GATEWAY_TOKEN=your-gw-token' >> .env
docker compose up -d --build
```

**Direct:**
```bash
git clone https://github.com/qingchencloud/clawapp.git
cd clawapp && npm run install:all && npm run build:h5
cp server/.env.example server/.env  # edit tokens
npm start
```

Open `http://your-ip:3210` on your phone.

### Remote Access

- **SSH Tunnel**: `ssh -f -N -R 0.0.0.0:3210:localhost:3210 user@server`
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3210`
- **Nginx**: Configure WebSocket proxy to port 3210

### Features

Real-time streaming chat, image attachments, Markdown rendering, session management, dark/light/auto theme, English/Chinese i18n, auto-reconnect, token auth.

</details>

---

<p align="center">
  由 <a href="https://qt.cool">晴辰云</a> 开发维护<br/>
  <a href="https://clawapp.qt.cool">clawapp.qt.cool</a>
</p>

## License

MIT
