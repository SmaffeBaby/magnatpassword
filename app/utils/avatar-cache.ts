// Signed avatar URLs expire after an hour. Keep a small local preview for the login screen.
export async function cacheProfileAvatar(url: string): Promise<string> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = backendUrl(url)
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Avatar preview unavailable')
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 96, 96)
  return canvas.toDataURL('image/webp', 0.85)
}
