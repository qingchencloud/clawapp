/**
 * 多媒体模块 — 支持图片/视频/音频/文件的选取、预览、附件构建、灯箱查看
 */

const MAX_IMAGE_SIZE = 5 * 1024 * 1024   // 图片 5MB
const MAX_FILE_SIZE = 20 * 1024 * 1024   // 其他文件 20MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/aac', 'audio/flac']
const ALL_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md,.json,.csv,.zip,.rar'

let _attachments = []
let _previewBar = null
let _onChangeCallback = null

/** 判断文件媒体类别 */
function mediaCategory(mime) {
  if (IMAGE_TYPES.some(t => mime.startsWith(t.split('/')[0])) || mime.startsWith('image/')) return 'image'
  if (VIDEO_TYPES.some(t => mime.startsWith(t.split('/')[0])) || mime.startsWith('video/')) return 'video'
  if (AUDIO_TYPES.some(t => mime.startsWith(t.split('/')[0])) || mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/** 格式化文件大小 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 文件扩展名图标 */
function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const map = { pdf: '📄', doc: '📝', docx: '📝', txt: '📃', md: '📃', json: '📋', csv: '📊', zip: '📦', rar: '📦' }
  return map[ext] || '📎'
}

export function initMedia(previewBarEl, onChange) {
  _previewBar = previewBarEl
  _onChangeCallback = onChange
}

/** 选取图片（保持原有入口兼容） */
export function pickImage() {
  pickFile('image/*')
}

/** 选取任意文件 */
export function pickFile(accept) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept || ALL_ACCEPT
  input.multiple = true
  input.onchange = () => handleFiles(input.files)
  input.click()
}

/** 选取多媒体（图片+视频+音频+文件） */
export function pickMedia() {
  pickFile(ALL_ACCEPT)
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    const cat = mediaCategory(file.type)
    const limit = cat === 'image' ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
    if (file.size > limit) {
      alert(`${file.name} 超过 ${formatSize(limit)} 限制`)
      return
    }
    readFileAsBase64(file).then(data => {
      _attachments.push({
        name: file.name,
        type: file.type,
        size: file.size,
        category: cat,
        data,
      })
      renderPreviews()
      _onChangeCallback?.()
    })
  })
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function renderPreviews() {
  if (!_previewBar) return
  _previewBar.innerHTML = ''

  if (_attachments.length === 0) {
    _previewBar.classList.remove('visible')
    return
  }

  _previewBar.classList.add('visible')

  _attachments.forEach((att, idx) => {
    const item = document.createElement('div')
    item.className = 'preview-item'

    if (att.category === 'image') {
      const img = document.createElement('img')
      img.className = 'preview-thumb'
      img.src = att.data
      item.appendChild(img)
    } else if (att.category === 'video') {
      const vid = document.createElement('video')
      vid.className = 'preview-thumb'
      vid.src = att.data
      vid.muted = true
      item.appendChild(vid)
    } else {
      // 音频或文件 — 显示图标+文件名
      const badge = document.createElement('div')
      badge.className = 'preview-thumb preview-file-badge'
      badge.innerHTML = `<span class="preview-file-icon">${att.category === 'audio' ? '🎵' : fileIcon(att.name)}</span><span class="preview-file-name">${att.name.length > 8 ? att.name.slice(0, 6) + '..' : att.name}</span>`
      item.appendChild(badge)
    }

    const removeBtn = document.createElement('button')
    removeBtn.className = 'remove-btn'
    removeBtn.textContent = '×'
    removeBtn.onclick = (e) => {
      e.stopPropagation()
      _attachments.splice(idx, 1)
      renderPreviews()
      _onChangeCallback?.()
    }

    item.appendChild(removeBtn)
    _previewBar.appendChild(item)
  })
}

/** 构建附件数组（发送给 Gateway） */
export function getAttachments() {
  return _attachments.map(a => {
    // 兼容移动端浏览器：data URL 可能包含额外参数如 charset=utf-8
    const match = /^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/s.exec(a.data)
    if (!match) return null
    const mimeType = match[1]
    // 移动端浏览器可能在 base64 中混入换行/空格，需清理
    const content = match[2].replace(/[\s\r\n]/g, '')
    const cat = a.category || mediaCategory(mimeType)
    // Gateway 目前只处理 image/* 附件，但我们仍然发送完整信息以便未来兼容
    return { type: cat, mimeType, content, fileName: a.name }
  }).filter(Boolean)
}

export function clearAttachments() {
  _attachments = []
  renderPreviews()
}

export function hasAttachments() {
  return _attachments.length > 0
}

/** 图片/视频灯箱 */
export function showLightbox(src, type) {
  let lb = document.querySelector('.lightbox')
  if (lb) lb.remove()

  lb = document.createElement('div')
  lb.className = 'lightbox visible'

  const isVideo = type === 'video' || /\.(mp4|webm|mov|mkv)(\?|$)/i.test(src) || src.startsWith('data:video/')
  const closeBtn = `<button class="close-lightbox">×</button>`

  if (isVideo) {
    lb.innerHTML = `${closeBtn}<video controls autoplay playsinline class="lightbox-video" src="${src}"></video>`
  } else {
    lb.innerHTML = `${closeBtn}<img src="${src}" alt="preview" />`
  }

  lb.querySelector('.close-lightbox').onclick = () => lb.remove()
  lb.onclick = (e) => { if (e.target === lb) lb.remove() }
  document.body.appendChild(lb)
}
