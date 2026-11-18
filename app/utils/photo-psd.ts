// Read the merged image written by PhotoCraft, rather than its viewport (which may
// be zoomed, panned or obscured by a dialog). A PNG never carries the PSD layers.
const invalid = () => new Error('Не удалось получить изображение из PSD. Сохраните PSD или экспортируйте PNG через меню PhotoCraft.')

export async function readPhotoComposite(buffer: ArrayBuffer) {
  const data = new DataView(buffer), bytes = new Uint8Array(buffer)
  const u16 = (at: number) => { if (at + 2 > bytes.length) throw invalid(); return data.getUint16(at) }
  const u32 = (at: number) => { if (at + 4 > bytes.length) throw invalid(); return data.getUint32(at) }
  const version = u16(4), channels = u16(12), height = u32(14), width = u32(18), depth = u16(22), mode = u16(24)
  const colors = mode === 3 ? 3 : mode === 1 ? 1 : 0
  const pixels = width * height, sampleBytes = depth / 8, rowBytes = width * sampleBytes
  const planeBytes = pixels * sampleBytes, total = planeBytes * channels
  if (u32(0) !== 0x38425053 || ![1, 2].includes(version) || !colors || channels < colors || channels > 56 || ![8, 16].includes(depth)
    || !width || !height || Math.max(width, height) > 16384 || pixels > 24_000_000 || total > 128 * 1024 * 1024) throw invalid()

  const resources = 30 + u32(26), resourceEnd = resources + 4 + u32(resources)
  for (let pos = resources + 4; pos + 12 <= resourceEnd;) {
    if (u32(pos) !== 0x3842494d) break
    const id = u16(pos + 4), nameLength = (bytes[pos + 6]! + 2) & ~1
    const lengthAt = pos + 6 + nameLength, length = u32(lengthAt), value = lengthAt + 4
    if (value + length > resourceEnd) throw invalid()
    // Version Info: a false hasRealMergedData flag means the composite is a placeholder.
    if (id === 1057 && length >= 5 && bytes[value + 4] === 0) throw invalid()
    pos = value + length + (length % 2)
  }
  const layerLength = version === 2 ? u32(resourceEnd + 4) : u32(resourceEnd)
  if (version === 2 && u32(resourceEnd)) throw invalid()
  const imageStart = resourceEnd + (version === 2 ? 8 : 4) + layerLength
  const compression = u16(imageStart)
  let offset = imageStart + 2, planes: Uint8Array

  if (compression === 0) {
    planes = bytes.subarray(offset, offset + total)
  } else if (compression === 1) {
    const count = channels * height, lengths = offset, size = version === 2 ? 4 : 2
    offset += count * size
    if (offset > bytes.length) throw invalid()
    planes = new Uint8Array(total)
    for (let row = 0; row < count; row++) {
      const at = lengths + row * size, end = offset + (size === 4 ? u32(at) : u16(at))
      if (end > bytes.length) throw invalid()
      let out = row * rowBytes
      const outEnd = out + rowBytes
      while (offset < end) {
        const control = data.getInt8(offset++)
        if (control === -128) continue
        const run = control >= 0 ? control + 1 : 1 - control
        if (out + run > outEnd) throw invalid()
        if (control >= 0) {
          if (offset + run > end) throw invalid()
          planes.set(bytes.subarray(offset, offset + run), out); offset += run
        } else {
          if (offset >= end) throw invalid()
          planes.fill(bytes[offset++]!, out, out + run)
        }
        out += run
      }
      if (out !== outEnd) throw invalid()
    }
  } else if (compression === 2 || compression === 3) {
    planes = new Uint8Array(total)
    const reader = new Blob([buffer.slice(offset)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
    let at = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (at + value.length > total) throw invalid()
        planes.set(value, at); at += value.length
      }
      if (at !== total) throw invalid()
    } finally { await reader.cancel().catch(() => {}) }
    if (compression === 3) {
      const samples = new DataView(planes.buffer)
      for (let row = 0; row < total; row += rowBytes) {
        for (let i = row + sampleBytes; i < row + rowBytes; i += sampleBytes) {
          if (depth === 8) planes[i] = planes[i]! + planes[i - 1]!
          else samples.setUint16(i, samples.getUint16(i) + samples.getUint16(i - 2))
        }
      }
    }
  } else throw invalid()
  if (planes.length !== total) throw invalid()

  const rgba = new Uint8ClampedArray(pixels * 4)
  const layerStart = resourceEnd + (version === 2 ? 8 : 4)
  const layerInfoBytes = version === 2 ? 8 : 4
  const hasLayerInfo = layerLength >= layerInfoBytes + 2 && u32(layerStart + layerInfoBytes - 4) >= 2
  // In 8-bit layered PSD, the sign of the layer count says whether the first
  // extra channel is merged transparency, rather than a saved selection.
  const hasAlpha = channels > colors && (!hasLayerInfo || (u16(layerStart + layerInfoBytes) & 0x8000) !== 0)
  const max = depth === 16 ? 65535 : 255
  const sample = (pos: number) => depth === 16 ? planes[pos]! * 256 + planes[pos + 1]! : planes[pos]!
  for (let index = 0; index < pixels; index++) {
    const pos = index * sampleBytes, out = index * 4
    const alpha = hasAlpha ? sample(pos + planeBytes * colors) / max : 1
    // PhotoCraft's merged PSD channels are matted against white.
    for (let c = 0; c < 3; c++) {
      const matted = sample(pos + (colors === 3 ? c * planeBytes : 0)) / max
      rgba[out + c] = alpha ? (matted - (1 - alpha)) / alpha * 255 : 0
    }
    rgba[out + 3] = alpha * 255
  }
  return { rgba, width, height }
}

export async function photoPsdToPng(buffer: ArrayBuffer): Promise<Blob> {
  const { rgba, width, height } = await readPhotoComposite(buffer)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw invalid()
  context.putImageData(new ImageData(rgba, width, height), 0, 0)
  try {
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(invalid()), 'image/png'))
  } finally { canvas.width = canvas.height = 0 }
}
