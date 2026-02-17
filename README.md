# OpenClaw Mobile

<p align="center">
  <strong>📱 Chat with your OpenClaw AI agent from any browser</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#connecting-to-openclaw">Connecting to OpenClaw</a> •
  <a href="#remote-access">Remote Access</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#faq">FAQ</a> •
  <a href="#中文说明">中文说明</a>
</p>

---

## What is this?

[OpenClaw](https://github.com/openclaw/openclaw) is a powerful AI agent platform. Its Gateway listens on `127.0.0.1:18789` by default — your phone can't reach it directly.

This project bridges that gap:

```
Phone Browser (any network)
    ↓ WebSocket (WS / WSS)
Proxy Server (this project, port 3210)
    ↓ WebSocket (localhost)
OpenClaw Gateway (port 18789)
```

The proxy server handles Gateway handshake/auth automatically, serves the H5 chat UI, and adds token-based access control.

## Features

- 💬 Real-time streaming chat (typewriter effect)
- 📷 Image attachments (base64)
- 📝 Markdown rendering with syntax highlighting
- ⚡ Quick command panel (/model, /think, /new, etc.)
- 🔧 Live tool call status display
- 📋 Session management (switch, create, delete)
- 🌙 Dark / Light / Auto theme
- 🌐 English / 中文 i18n
- 🔄 Auto-reconnect with retry queue
- 🔒 Token authentication

---

## Quick Start

### Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) Gateway running (default port 18789)
- [Node.js](https://nodejs.org/) 18+ **or** [Docker](https://www.docker.com/)

### Option A: Docker (Recommended)

```bash
git clone https://github.com/qingchencloud/openclaw-mobile.git
cd openclaw-mobile
```

Create `.env` in the project root:

```bash
PROXY_TOKEN=your-secret-token
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
```

> 💡 Find your Gateway token in `~/.openclaw/gateway.yaml` → `token` field.

```bash
docker compose up -d --build
```

Open `http://your-ip:3210` on your phone.

### Option B: Run Directly

```bash
git clone https://github.com/qingchencloud/openclaw-mobile.git
cd openclaw-mobile
npm run install:all
npm run build:h5
cp server/.env.example server/.env
# Edit server/.env with your tokens
npm start
```

---

## Deployment

### Local Deployment (Same Network)

Best for home/office use. Phone and server on the same WiFi.

```bash
# 1. Clone & install
git clone https://github.com/qingchencloud/openclaw-mobile.git
cd openclaw-mobile && npm run install:all

# 2. Build frontend
npm run build:h5

# 3. Configure
cp server/.env.example server/.env
# Edit server/.env:
#   PROXY_TOKEN=my-token-123
#   OPENCLAW_GATEWAY_TOKEN=<from ~/.openclaw/gateway.yaml>

# 4. Start
npm start
```

Find your IP: `ifconfig | grep "inet "` (Mac) / `ip addr` (Linux) / `ipconfig` (Windows)

Phone browser → `http://<your-ip>:3210`

### Docker Deployment

```bash
# Create .env
cat > .env << 'EOF'
PROXY_TOKEN=my-token-123
OPENCLAW_GATEWAY_TOKEN=<your-gateway-token>
ALLOWED_ORIGINS=
EOF

# Build & run
docker compose up -d --build

# Check status
docker compose logs -f
```

The Docker setup uses `host.docker.internal` to reach the Gateway on the host machine.

### Production Deployment (Remote Server)

For accessing from anywhere. Requires a server with a public IP.

**Option 1: SSH Tunnel (Quick & Simple)**

```bash
# On your local machine (where OpenClaw runs):
ssh -f -N \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=4 \
  -R 0.0.0.0:3210:127.0.0.1:3210 \
  user@your-server.com
```

> ⚠️ Server needs `GatewayPorts yes` in `/etc/ssh/sshd_config` and port 3210 open in firewall.

Phone browser → `http://your-server-ip:3210`

**Option 2: Cloudflare Tunnel (Free, No Public IP Needed)**

```bash
# Install cloudflared
brew install cloudflared  # Mac
# or: https://github.com/cloudflare/cloudflared/releases

# One-command tunnel (temporary URL)
cloudflared tunnel --url http://localhost:3210
```

This gives you a `https://xxx.trycloudflare.com` URL. WebSocket works automatically over HTTPS/WSS.

For a permanent domain, see [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

**Option 3: Reverse Proxy (Nginx)**

```nginx
server {
    listen 443 ssl;
    server_name openclaw.yourdomain.com;

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

---

## Connecting to OpenClaw

After deployment, open the H5 page in your browser. You'll see a connection form:

| Field | What to enter | Example |
|-------|--------------|---------|
| Server Address | Proxy server address:port | `192.168.1.100:3210` (LAN) or `your-server.com:3210` (remote) |
| Token | `PROXY_TOKEN` from your `.env` | `my-token-123` |

The page auto-detects the current host. If accessing via HTTPS, WebSocket automatically upgrades to WSS.

---

## Remote Access

| Method | Pros | Cons |
|--------|------|------|
| **SSH Tunnel** | Simple, no extra software | Needs public server, tunnel may drop |
| **Cloudflare Tunnel** | Free, auto HTTPS, stable | Depends on Cloudflare |
| **Reverse Proxy** | Full control, custom domain | Needs server + SSL setup |
| **Tailscale/ZeroTier** | P2P, encrypted | Phone needs client app |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROXY_PORT` | No | `3210` | Proxy server port |
| `PROXY_TOKEN` | **Yes** | - | Client access token |
| `OPENCLAW_GATEWAY_URL` | No | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | **Yes** | - | Gateway auth token |
| `ALLOWED_ORIGINS` | No | - | Extra CORS origins (comma-separated) |

### H5 Client Settings

Click the ⚙️ icon in the chat header to access:

- **Theme**: Light / Dark / Auto (follows system)
- **Language**: 中文 / English
- **Disconnect**: Return to connection page

---

## Project Structure

```
openclaw-mobile/
├── server/                # WebSocket proxy server
│   ├── index.js           # Express + WS proxy + Gateway handshake
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── h5/                    # H5 mobile frontend
│   ├── src/
│   │   ├── main.js        # Entry + connection page
│   │   ├── ws-client.js   # WebSocket protocol layer
│   │   ├── chat-ui.js     # Chat UI + session management
│   │   ├── commands.js    # Quick command panel
│   │   ├── markdown.js    # Markdown renderer + syntax highlight
│   │   ├── media.js       # Image handling
│   │   ├── i18n.js        # Internationalization (zh-CN / en)
│   │   ├── theme.js       # Theme management (light/dark/auto)
│   │   ├── settings.js    # Settings panel
│   │   ├── style.css      # Main styles + theme variables
│   │   └── components.css # Component styles
│   ├── index.html
│   └── vite.config.js
├── Dockerfile             # Multi-stage build
├── docker-compose.yml     # Production deployment
├── docker-compose.test.yml # Test environment
└── README.md
```

---

## Development

```bash
# Install dependencies
npm run install:all

# Start H5 dev server (hot reload on port 5173)
npm run dev:h5

# Start proxy server (port 3210)
npm run dev:server
```

---

## FAQ

**Q: Stuck on "Connecting..."?**

1. Check OpenClaw Gateway is running: `curl http://localhost:18789`
2. Verify `OPENCLAW_GATEWAY_TOKEN` is correct
3. Docker: Gateway URL should be `ws://host.docker.internal:18789`

**Q: Can't open page on phone?**

1. Same WiFi as the server?
2. Firewall allows port 3210?
3. Using the server's IP, not `localhost`?

**Q: WebSocket keeps disconnecting?**

The proxy has built-in 30s ping keepalive. If using a reverse proxy, ensure its timeout is > 60s. For SSH tunnels, use `-o ServerAliveInterval=15`.

**Q: Multiple users at once?**

Yes. Each connection creates an independent Gateway session. All share the same OpenClaw instance.

**Q: How to add more languages?**

Edit `h5/src/i18n.js`, add a new locale key (e.g. `'ja'`) with translations, then add a button in `settings.js`.

---

## 中文说明

<details>
<summary>点击展开中文文档</summary>

### 这是什么？

OpenClaw Mobile 是一个 H5 移动端聊天客户端，让你通过手机浏览器和 OpenClaw AI 智能体聊天。

### 快速开始

**Docker 部署（推荐）：**

```bash
git clone https://github.com/qingchencloud/openclaw-mobile.git
cd openclaw-mobile

# 创建 .env 文件
echo 'PROXY_TOKEN=你的密码' > .env
echo 'OPENCLAW_GATEWAY_TOKEN=你的Gateway-Token' >> .env

# 启动
docker compose up -d --build
```

**直接运行：**

```bash
git clone https://github.com/qingchencloud/openclaw-mobile.git
cd openclaw-mobile
npm run install:all
npm run build:h5
cp server/.env.example server/.env
# 编辑 server/.env 填入 token
npm start
```

### 手机访问

1. 确保手机和电脑在同一 WiFi
2. 查看电脑 IP：Mac 用 `ifconfig`，Windows 用 `ipconfig`
3. 手机浏览器打开 `http://电脑IP:3210`
4. 填入服务器地址和 Token，点击连接

### 外网访问

如果不在同一网络，可以用：
- **SSH 隧道**：`ssh -f -N -R 0.0.0.0:3210:127.0.0.1:3210 你的服务器`
- **Cloudflare Tunnel**：`cloudflared tunnel --url http://localhost:3210`
- **Nginx 反向代理**：配置 WebSocket 转发

### 设置

点击聊天页右上角 ⚙️ 图标：
- 主题：浅色 / 深色 / 跟随系统
- 语言：中文 / English
- 断开连接

</details>

---

## Security

- Always set a strong `PROXY_TOKEN` (32+ random chars recommended)
- Gateway token stays server-side only — never exposed to the client
- For public access, use HTTPS (Cloudflare Tunnel or Nginx + SSL)
- Optional: Add [Cloudflare Access](https://www.cloudflare.com/products/zero-trust/) for extra auth

---

## License

MIT
