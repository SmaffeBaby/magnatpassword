import { fromBuffer, type ZipFile } from 'yauzl'
import { ZipFile as ZipWriter } from 'yazl'
import { crc32 } from 'node:zlib'
import { documentMaxSize, documentMetadataSchema } from '../../shared/utils/project-documents'
export const documentArchiveMaxSize = 100 * 1024 * 1024
export interface DocumentArchiveEntry { parts: string[]; bytes?: Buffer }
export async function readDocumentArchive(bytes: Buffer): Promise<DocumentArchiveEntry[]> {
  if (!bytes.length || bytes.length > documentArchiveMaxSize) throw new Error('ZIP должен быть не больше 100 МБ')
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, file) => error ? reject(error) : resolve(file!)))
  return new Promise((resolve, reject) => {
    const entries: DocumentArchiveEntry[] = [], paths = new Set<string>()
    let total = 0, count = 0, stopped = false
    const fail = (error: unknown) => { if (stopped) return; stopped = true; zip.close(); reject(error) }
    zip.on('error', fail)
    zip.on('end', () => { if (!stopped) { stopped = true; resolve(entries) } })
    zip.on('entry', async entry => {
      try {
        if (++count > 1001) throw new Error('В архиве допускается до 500 файлов и 500 папок')
        if (entry.generalPurposeBitFlag & 1) throw new Error('Архивы с паролем не поддерживаются')
        if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('Символические ссылки в архиве не поддерживаются')
        const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName
        const parts = name.split('/')
        // Use the same name rules as uploads and folders: timestamps may contain colons.
        // yauzl with strictFileNames already rejects absolute paths, drive prefixes,
        // backslashes and traversal; the schema also rejects empty/dot components.
        if (!parts.length || parts.length > (directory ? 20 : 21) || parts.some((part: string) => !documentMetadataSchema.shape.name.safeParse(part).success)) throw new Error('В архиве обнаружен недопустимый путь')
        if (paths.has(name)) throw new Error('В архиве обнаружены повторяющиеся пути')
        paths.add(name)
        if (directory) entries.push({ parts })
        else {
          if (entry.uncompressedSize > documentMaxSize || total + entry.uncompressedSize > documentArchiveMaxSize) throw new Error('После распаковки: до 20 МБ на файл и до 100 МБ суммарно')
          const stream = await new Promise<import('node:stream').Readable>((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!)))
          const chunks: Buffer[] = []; let size = 0
          for await (const chunk of stream) {
            size += chunk.length; total += chunk.length
            if (size > documentMaxSize || total > documentArchiveMaxSize) { stream.destroy(); throw new Error('Превышен размер распакованного архива') }
            chunks.push(chunk)
          }
          const bytes = Buffer.concat(chunks)
          if (size !== entry.uncompressedSize || crc32(bytes) !== entry.crc32) throw new Error('Архив повреждён')
          // Empty ordinary files can round-trip through archives, though direct uploads require content.
          entries.push({ parts, bytes })
        }
        zip.readEntry()
      } catch (error) { fail(error) }
    })
    zip.readEntry()
  })
}
export async function writeDocumentArchive(entries: { path: string; bytes?: Buffer }[]): Promise<Buffer> {
  const zip = new ZipWriter(), chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => { zip.outputStream.on('data', chunk => chunks.push(chunk)); zip.outputStream.on('error', reject); zip.on('error', reject); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))) })
  for (const entry of entries) {
    if (entry.bytes !== undefined) zip.addBuffer(entry.bytes, entry.path)
    else zip.addEmptyDirectory(entry.path)
  }
  zip.end()
  return result
}
