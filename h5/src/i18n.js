/**
 * 国际化模块 - 中英文切换
 */

const LANG_KEY = 'clawapp-lang'

const messages = {
  'zh-CN': {
    // 连接页
    'app.title': 'ClawApp',
    'app.subtitle': '连接到你的 OpenClaw 智能体',
    'setup.host': '服务器地址',
    'setup.host.placeholder': '例如: 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': '输入访问令牌',
    'setup.connect': '连接',
    'setup.connecting': '连接中...',
    'setup.error.host': '请输入服务器地址',
    'setup.error.token': '请输入 Token',
    'setup.error.timeout': '连接超时，请检查地址和网络',
    'setup.error.auth': 'Token 认证失败，请检查 Token 是否正确',
    'setup.error.server': '服务器错误：',
    // 聊天页
    'chat.input.placeholder': '输入消息...',
    'chat.send': '发送',
    'chat.abort': '停止',
    'chat.no.messages': '暂无消息',
    'chat.load.error': '加载历史失败',
    'chat.send.error': '发送失败',
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
    'guide.tip4': '📷 点击回形针按钮发送图片',
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
    'voice.need.https': '语音输入需要 HTTPS 访问，请通过域名访问',
    'session.new.agent': '智能体 (高级)',
    'session.new.agent.hint': '默认 main，多智能体场景可切换',
  },
  'en': {
    'app.title': 'ClawApp',
    'app.subtitle': 'Connect to your OpenClaw agent',
    'setup.host': 'Server Address',
    'setup.host.placeholder': 'e.g. 192.168.1.100:3210',
    'setup.token': 'Token',
    'setup.token.placeholder': 'Enter access token',
    'setup.connect': 'Connect',
    'setup.connecting': 'Connecting...',
    'setup.error.host': 'Please enter server address',
    'setup.error.token': 'Please enter token',
    'setup.error.timeout': 'Connection timeout, check address and network',
    'setup.error.auth': 'Token authentication failed, please check your token',
    'setup.error.server': 'Server error: ',
    'chat.input.placeholder': 'Type a message...',
    'chat.send': 'Send',
    'chat.abort': 'Stop',
    'chat.no.messages': 'No messages yet',
    'chat.load.error': 'Failed to load history',
    'chat.send.error': 'Send failed',
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
    'guide.tip4': '📷 Tap the clip icon to send images',
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
    'voice.need.https': 'Voice input requires HTTPS access',
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
