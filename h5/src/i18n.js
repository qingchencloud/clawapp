/**
 * 国际化模块 - 中英文切换
 */

const LANG_KEY = 'clawapp-lang'

const messages = {
  'zh-CN': {
    // 连接页
    'app.title': 'ClawApp',
    'app.subtitle': '连接到你的 OpenClaw 智能体',
    'setup.host': 'ClawApp 服务器地址',
    'setup.host.placeholder': 'ClawApp 地址，如 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': '输入访问令牌',
    'setup.connect': '连接',
    'setup.connecting': '连接中...',
    'setup.error.host': '请输入服务器地址',
    'setup.error.token': '请输入 Token',
    'setup.error.timeout': '连接超时，请检查地址和网络',
    'setup.error.auth': 'Token 认证失败，请检查 Token 是否正确',
    'setup.error.server': '服务器错误：',
    'setup.tips.toggle': '不知道怎么填？点这里看说明',
    'setup.tips.host.title': '服务器地址填什么？',
    'setup.tips.host.desc': '填你电脑的 IP + 端口，格式如 192.168.1.100:3210。\n• 在电脑端启动 ClawApp 后，终端会显示地址\n• 手机和电脑需连接同一个 WiFi\n• 如果就在本机访问，直接用默认值即可',
    'setup.tips.token.title': 'Token 填什么？',
    'setup.tips.token.desc': '安装 ClawApp 时你设置的连接密码。\n• 如果忘记了，可以在电脑上查看 server/.env 文件中的 PROXY_TOKEN\n• 也可以重新运行安装脚本重新设置',
    'setup.tips.doc': '查看完整文档',
    'setup.firstrun.title': '欢迎使用 ClawApp',
    'setup.firstrun.subtitle': '首次启动，请设置你的连接密码',
    'setup.firstrun.password': '设置密码',
    'setup.firstrun.password.placeholder': '输入你的连接密码（至少 4 位）',
    'setup.firstrun.confirm': '确认密码',
    'setup.firstrun.confirm.placeholder': '再次输入密码',
    'setup.firstrun.submit': '设置并连接',
    'setup.firstrun.error.short': '密码长度至少 4 位',
    'setup.firstrun.error.mismatch': '两次密码不一致',
    'setup.firstrun.error.fail': '设置失败：',
    'settings.password': '修改连接密码',
    'settings.password.current': '当前密码',
    'settings.password.new': '新密码',
    'settings.password.confirm': '确认新密码',
    'settings.password.submit': '修改',
    'settings.password.success': '密码已修改，下次连接时使用新密码',
    'settings.password.error.short': '新密码长度至少 4 位',
    'settings.password.error.mismatch': '两次密码不一致',
    'settings.password.error.wrong': '当前密码错误',
    'settings.password.error.fail': '修改失败',
    // 聊天页
    'chat.input.placeholder': '输入消息...',
    'chat.send': '发送',
    'chat.abort': '停止',
    'chat.no.messages': '暂无消息',
    'chat.load.error': '加载历史失败',
    'chat.send.error': '发送失败',
    'chat.error.prefix': '错误',
    'chat.error.unknown': '未知错误',
    'chat.session.missing.manual': '当前会话不存在，请手动切换会话后重试',
    'chat.session.missing.fallback': '当前会话不存在，正在自动回退到默认会话',
    'chat.reconnecting': '连接中断，正在重连...',
    'chat.disconnected': '连接已断开',
    'chat.retry': '重新连接',
    'chat.aborted': '已中止',
    'context.copy': '复制文本',
    'context.copyCode': '复制代码',
    // 会话管理
    'session.title': '会话管理',
    'session.new': '新建会话',
    'session.new.name': '会话名称',
    'session.new.name.placeholder': '例如: debug、research',
    'session.new.hint': '会话 Key 格式: agent:main:<名称>',
    'session.new.create': '创建',
    'session.delete': '删除会话',
    'session.delete.confirm': '确定删除「{name}」？',
    'session.delete.warning': '此操作不可撤销。',
    'session.delete.btn': '删除',
    'session.delete.fail': '删除失败',
    'session.created': '已创建新会话: {name}',
    'session.loading': '加载中...',
    'session.empty': '没有找到会话',
    'session.load.error': '加载失败',
    'session.main': '主会话',
    // 快捷指令
    'cmd.title': '快捷指令',
    'cmd.model': '模型管理',
    'cmd.model.switch': '切换模型（需补充参数）',
    'cmd.model.list': '列出可用模型',
    'cmd.model.status': '当前模型状态',
    'cmd.session': '会话管理',
    'cmd.session.new': '新建会话',
    'cmd.session.reset': '重置当前会话',
    'cmd.session.compact': '压缩上下文',
    'cmd.session.stop': '停止当前任务',
    'cmd.think': '思考控制',
    'cmd.think.off': '关闭思考',
    'cmd.think.low': '低强度思考',
    'cmd.think.medium': '中等思考',
    'cmd.think.high': '高强度思考',
    'cmd.info': '信息查询',
    'cmd.info.help': '帮助信息',
    'cmd.info.status': '系统状态',
    'cmd.info.whoami': '当前身份',
    'cmd.info.commands': '所有指令',
    'cmd.info.context': '上下文信息',
    'cmd.skill': '技能',
    'cmd.skill.run': '执行技能（需补充名称）',
    'cmd.advanced': '高级',
    'cmd.advanced.verbose.on': '开启详细输出',
    'cmd.advanced.verbose.off': '关闭详细输出',
    'cmd.advanced.compact': '压缩上下文（可附指令）',
    // 工具状态
    'tool.running': '执行中...',
    'tool.done': '已完成',
    'tool.error': '失败',
    // 时间
    'time.just': '刚刚',
    'time.min': '{n}分钟前',
    'time.hour': '{n}小时前',
    'time.day': '{n}天前',
    // 设置
    'settings.title': '设置',
    'settings.theme': '主题',
    'settings.theme.light': '浅色',
    'settings.theme.dark': '深色',
    'settings.theme.auto': '跟随系统',
    'settings.lang': '语言',
    'settings.layout': '布局',
    'settings.layout.compact': '紧凑',
    'settings.layout.auto': '自适应',
    'settings.layout.wide': '宽屏',
    'settings.reload': '重新加载页面',
    'settings.disconnect': '断开连接',
    // 关于
    'about.title': '关于 ClawApp',
    'about.version': '版本',
    'about.homepage': '官网',
    'about.github': '开源仓库',
    'about.cftunnel': 'cftunnel 内网穿透',
    'about.community': '社区交流',
    'about.license': '开源协议',
    'about.copyright': '© 2025 晴辰云',
    // 引导
    'guide.welcome': '欢迎使用 ClawApp 👋',
    'guide.tip1': '💬 在底部输入框发送消息与 AI 聊天',
    'guide.tip2': '📋 点击顶部标题可切换/管理会话',
    'guide.tip3': '⚡ 左下角闪电按钮打开快捷指令',
    'guide.tip4': '📎 点击回形针按钮发送图片、视频、音频、文件',
    'guide.tip5': '⚙️ 右上角齿轮进入设置（主题/语言）',
    'guide.start': '开始使用',
    // 连接
    'setup.auto.retry': '正在重新连接...',
    'setup.auto.fail': '自动连接失败，请手动连接',
    // 通用
    'cancel': '取消',
    'confirm': '确认',
    'copy': '复制',
    'copied': '已复制',
    'copy.fail': '失败',
    'voice.error': '语音识别失败，请重试',
    'voice.need.permission': '请允许麦克风权限后重试',
    'voice.service.unavailable': '语音服务不可用（需要网络连接 Google 服务）',
    'voice.need.https': '语音输入需要 HTTPS 访问，请通过域名访问',
    'media.file': '文件',
    'media.download': '下载',
    'media.unsupported': '不支持的媒体类型',
    'media.size.limit': '文件超过大小限制',
    'session.new.agent': '智能体 (高级)',
    'session.new.agent.hint': '默认 main，多智能体场景可切换',
    // 通知
    'settings.notify': '通知',
    'settings.notify.enable': '开启通知权限',
    'settings.notify.granted': '已开启，AI 回复时屏幕内容可收到提醒',
    'settings.notify.denied': '已被浏览器拒绝，请在浏览器设置中手动开启',
    'settings.notify.unsupported': '当前浏览器不支持通知',
    'notify.ai.reply': 'AI 助手',
    'notify.media': '[媒体消息]',
  },
  'en': {
    'app.title': 'ClawApp',
    'app.subtitle': 'Connect to your OpenClaw agent',
    'setup.host': 'ClawApp Server Address',
    'setup.host.placeholder': 'ClawApp address, e.g. 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': 'Enter access token',
    'setup.connect': 'Connect',
    'setup.connecting': 'Connecting...',
    'setup.error.host': 'Please enter server address',
    'setup.error.token': 'Please enter token',
    'setup.error.timeout': 'Connection timeout, check address and network',
    'setup.error.auth': 'Token authentication failed, please check your token',
    'setup.error.server': 'Server error: ',
    'setup.tips.toggle': 'Not sure what to fill in? Tap here',
    'setup.tips.host.title': 'What is Server Address?',
    'setup.tips.host.desc': 'Your PC\'s IP + port, e.g. 192.168.1.100:3210.\n• The address is shown in terminal when ClawApp starts\n• Phone and PC must be on the same WiFi\n• If accessing locally, use the default value',
    'setup.tips.token.title': 'What is Token?',
    'setup.tips.token.desc': 'The connection password you set during ClawApp installation.\n• If forgotten, check PROXY_TOKEN in server/.env on your PC\n• Or re-run the install script to reset it',
    'setup.tips.doc': 'Full Documentation',
    'setup.firstrun.title': 'Welcome to ClawApp',
    'setup.firstrun.subtitle': 'First time? Set your connection password',
    'setup.firstrun.password': 'Set Password',
    'setup.firstrun.password.placeholder': 'Enter your password (min 4 chars)',
    'setup.firstrun.confirm': 'Confirm Password',
    'setup.firstrun.confirm.placeholder': 'Enter password again',
    'setup.firstrun.submit': 'Set & Connect',
    'setup.firstrun.error.short': 'Password must be at least 4 characters',
    'setup.firstrun.error.mismatch': 'Passwords do not match',
    'setup.firstrun.error.fail': 'Setup failed: ',
    'settings.password': 'Change Password',
    'settings.password.current': 'Current Password',
    'settings.password.new': 'New Password',
    'settings.password.confirm': 'Confirm New Password',
    'settings.password.submit': 'Change',
    'settings.password.success': 'Password changed. Use new password next time.',
    'settings.password.error.short': 'New password must be at least 4 characters',
    'settings.password.error.mismatch': 'Passwords do not match',
    'settings.password.error.wrong': 'Current password is incorrect',
    'settings.password.error.fail': 'Change failed',
    'chat.input.placeholder': 'Type a message...',
    'chat.send': 'Send',
    'chat.abort': 'Stop',
    'chat.no.messages': 'No messages yet',
    'chat.load.error': 'Failed to load history',
    'chat.send.error': 'Send failed',
    'chat.error.prefix': 'Error',
    'chat.error.unknown': 'Unknown error',
    'chat.session.missing.manual': 'Current session no longer exists. Please switch sessions and try again.',
    'chat.session.missing.fallback': 'Current session no longer exists. Falling back to default session.',
    'chat.reconnecting': 'Disconnected, reconnecting...',
    'chat.disconnected': 'Connection lost',
    'chat.retry': 'Reconnect',
    'chat.aborted': 'Aborted',
    'context.copy': 'Copy text',
    'context.copyCode': 'Copy code',
    'session.title': 'Sessions',
    'session.new': 'New Session',
    'session.new.name': 'Session Name',
    'session.new.name.placeholder': 'e.g. debug, research',
    'session.new.hint': 'Session key format: agent:main:<name>',
    'session.new.create': 'Create',
    'session.delete': 'Delete Session',
    'session.delete.confirm': 'Delete "{name}"?',
    'session.delete.warning': 'This cannot be undone.',
    'session.delete.btn': 'Delete',
    'session.delete.fail': 'Delete failed',
    'session.created': 'Created new session: {name}',
    'session.loading': 'Loading...',
    'session.empty': 'No sessions found',
    'session.load.error': 'Load failed',
    'session.main': 'Main Session',
    'cmd.title': 'Commands',
    'cmd.model': 'Model',
    'cmd.model.switch': 'Switch model (append params)',
    'cmd.model.list': 'List available models',
    'cmd.model.status': 'Current model status',
    'cmd.session': 'Session',
    'cmd.session.new': 'New session',
    'cmd.session.reset': 'Reset current session',
    'cmd.session.compact': 'Compact context',
    'cmd.session.stop': 'Stop current task',
    'cmd.think': 'Thinking',
    'cmd.think.off': 'Disable thinking',
    'cmd.think.low': 'Low intensity',
    'cmd.think.medium': 'Medium intensity',
    'cmd.think.high': 'High intensity',
    'cmd.info': 'Info',
    'cmd.info.help': 'Help',
    'cmd.info.status': 'System status',
    'cmd.info.whoami': 'Current identity',
    'cmd.info.commands': 'All commands',
    'cmd.info.context': 'Context info',
    'cmd.skill': 'Skills',
    'cmd.skill.run': 'Run skill (append name)',
    'cmd.advanced': 'Advanced',
    'cmd.advanced.verbose.on': 'Enable verbose output',
    'cmd.advanced.verbose.off': 'Disable verbose output',
    'cmd.advanced.compact': 'Compact context (append instruction)',
    'tool.running': 'Running...',
    'tool.done': 'Done',
    'tool.error': 'Failed',
    'time.just': 'just now',
    'time.min': '{n}m ago',
    'time.hour': '{n}h ago',
    'time.day': '{n}d ago',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.auto': 'System',
    'settings.lang': 'Language',
    'settings.layout': 'Layout',
    'settings.layout.compact': 'Compact',
    'settings.layout.auto': 'Auto',
    'settings.layout.wide': 'Wide',
    'settings.reload': 'Reload Page',
    'settings.disconnect': 'Disconnect',
    // 关于
    'about.title': 'About ClawApp',
    'about.version': 'Version',
    'about.homepage': 'Website',
    'about.github': 'GitHub',
    'about.cftunnel': 'cftunnel Tunnel',
    'about.community': 'Community',
    'about.license': 'License',
    'about.copyright': '© 2025 QingchenCloud',
    'guide.welcome': 'Welcome to ClawApp 👋',
    'guide.tip1': '💬 Type in the input box below to chat with AI',
    'guide.tip2': '📋 Tap the title bar to switch/manage sessions',
    'guide.tip3': '⚡ Tap the bolt icon for quick commands',
    'guide.tip4': '📎 Tap the clip icon to send images, videos, audio, or files',
    'guide.tip5': '⚙️ Tap the gear icon for settings (theme/language)',
    'guide.start': 'Get Started',
    'setup.auto.retry': 'Reconnecting...',
    'setup.auto.fail': 'Auto-connect failed, please connect manually',
    'cancel': 'Cancel',
    'confirm': 'OK',
    'copy': 'Copy',
    'copied': 'Copied',
    'copy.fail': 'Failed',
    'voice.error': 'Voice recognition failed',
    'voice.need.permission': 'Please allow microphone permission and try again',
    'voice.service.unavailable': 'Voice service unavailable (network connection to Google services is required)',
    'voice.need.https': 'Voice input requires HTTPS access',
    // Notifications
    'settings.notify': 'Notifications',
    'settings.notify.enable': 'Enable Notifications',
    'settings.notify.granted': 'Enabled — you\'ll be notified when AI replies in background',
    'settings.notify.denied': 'Blocked by browser — please allow in browser settings',
    'settings.notify.unsupported': 'Not supported in this browser',
    'notify.ai.reply': 'AI Assistant',
    'notify.media': '[Media message]',
    'media.file': 'File',
    'media.download': 'Download',
    'media.unsupported': 'Unsupported media type',
    'media.size.limit': 'File exceeds size limit',
    'session.new.agent': 'Agent (Advanced)',
    'session.new.agent.hint': 'Default: main',
  }
}

let _currentLang = 'zh-CN'
let _onLangChange = []

/** 检测浏览器语言 */
function detectLang() {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved && messages[saved]) return saved
  const nav = navigator.language || navigator.userLanguage || 'zh-CN'
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

/** 初始化 */
export function initI18n() {
  _currentLang = detectLang()
}

/** 获取当前语言 */
export function getLang() {
  return _currentLang
}

/** 切换语言 */
export function setLang(lang) {
  if (!messages[lang]) return
  _currentLang = lang
  localStorage.setItem(LANG_KEY, lang)
  _onLangChange.forEach(fn => { try { fn(lang) } catch (e) { console.error(e) } })
}

/** 翻译 */
export function t(key, params) {
  let text = messages[_currentLang]?.[key] || messages['zh-CN']?.[key] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
  }
  return text
}

/** 监听语言变化 */
export function onLangChange(fn) {
  _onLangChange.push(fn)
  return () => { _onLangChange = _onLangChange.filter(cb => cb !== fn) }
}

/** 格式化相对时间 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  if (diffMin < 1) return t('time.just')
  if (diffMin < 60) return t('time.min', { n: diffMin })
  if (diffMin < 1440) return t('time.hour', { n: Math.floor(diffMin / 60) })
  return t('time.day', { n: Math.floor(diffMin / 1440) })
}
