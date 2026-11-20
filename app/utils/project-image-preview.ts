import { documentExtension } from '~~/shared/utils/project-documents'

const imageTypes: Record<string, string> = {
  avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon', jpeg: 'image/jpeg', jpg: 'image/jpeg',
  png: 'image/png', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp'
}

export function canPreviewProjectImage(name: string) {
  const extension = documentExtension(name)
  return Object.hasOwn(imageTypes, extension) || extension === 'psd' || extension === 'psb'
}

export async function projectImagePreview(blob: Blob, name: string, type?: string) {
  const extension = documentExtension(name)
  if (extension === 'psd' || extension === 'psb') {
    const { photoPsdToPng } = await import('./photo-psd')
    return photoPsdToPng(await blob.arrayBuffer())
  }
  // The authenticated content endpoint serves downloads as application/octet-stream.
  const mime = Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : undefined
  return blob.slice(0, blob.size, mime || (type?.startsWith('image/') ? type : blob.type))
}
