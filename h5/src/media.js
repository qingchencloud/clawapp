const MAX_SIZE = 4 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

let _attachments = []
let _previewBar = null
let _onChangeCallback = null

export function initMedia(previewBarEl, onChange) {
  _previewBar = previewBarEl
  _onChangeCallback = onChange
}

export function pickImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => handleFiles(input.files)
  input.click()
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!ALLOWED_TYPES.includes(file.type)) return
    if (file.size > MAX_SIZE) {
      alert(`图片 ${file.name} 超过 4MB 限制`)
      return
    }
    readFileAsBase64(file).then(data => {
      _attachments.push({
        name: file.name,
        type: file.type,
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

    const img = document.createElement('img')
    img.className = 'preview-thumb'
    img.src = att.data

    const removeBtn = document.createElement('button')
    removeBtn.className = 'remove-btn'
    removeBtn.textContent = '×'
    removeBtn.onclick = (e) => {
      e.stopPropagation()
      _attachments.splice(idx, 1)
      renderPreviews()
      _onChangeCallback?.()
    }

    item.appendChild(img)
    item.appendChild(removeBtn)
    _previewBar.appendChild(item)
  })
}

export function getAttachments() {
  return _attachments.map(a => ({
    name: a.name,
    mimeType: a.type,
    data: a.data,
  }))
}

export function clearAttachments() {
  _attachments = []
  renderPreviews()
}

export function hasAttachments() {
  return _attachments.length > 0
}

export function showLightbox(src) {
  let lb = document.querySelector('.lightbox')
  if (!lb) {
    lb = document.createElement('div')
    lb.className = 'lightbox'
    lb.innerHTML = `
      <button class="close-lightbox">×</button>
      <img src="" alt="preview" />
    `
    lb.querySelector('.close-lightbox').onclick = () => lb.classList.remove('visible')
    lb.onclick = (e) => { if (e.target === lb) lb.classList.remove('visible') }
    document.body.appendChild(lb)
  }
  lb.querySelector('img').src = src
  lb.classList.add('visible')
}
