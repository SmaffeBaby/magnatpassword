import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm, access, cp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'

const editors = JSON.parse(await readFile(new URL('./document-editors.json', import.meta.url), 'utf8'))
const cache = resolve('artifacts/document-editors')
await mkdir(cache, { recursive: true })
await mkdir('public/editors', { recursive: true })
for (const editor of editors) {
  const archive = join(cache, editor.archive)
  let bytes
  try { bytes = await readFile(archive) } catch (failure) { if (failure.code !== 'ENOENT') throw failure }
  if (!bytes) {
    const response = await fetch(editor.url, { signal: AbortSignal.timeout(180_000) })
    if (!response.ok) throw new Error(`Cannot download ${editor.app}: ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (createHash('sha256').update(bytes).digest('hex') !== editor.sha256) throw new Error(`Checksum mismatch for ${editor.archive}`)
  await writeFile(archive, bytes)
  const destination = resolve('public/editors', editor.app)
  try {
    if ((await readFile(join(destination, '.release'), 'utf8')) === `layout-v2:${editor.sha256}`) {
      console.log(`${editor.app} ${editor.version}: ready`)
      continue
    }
  } catch (failure) { if (failure.code !== 'ENOENT') throw failure }
  const staging = await mkdtemp(join(tmpdir(), 'magnat-editor-'))
  try {
    const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')
    const prefix = `${editor.app}-web-${editor.version}/`
    if (entries.some(entry => !entry.startsWith(prefix) || entry.split('/').includes('..') || entry.includes('\\'))) throw new Error(`Unsafe archive ${editor.archive}`)
    execFileSync('unzip', ['-q', archive, '-d', staging])
    const extracted = join(staging, prefix)
    await access(join(extracted, 'index.html'))
    // Upstream files, branding and license/attribution notices are served unmodified.
    await rm(destination, { recursive: true, force: true })
    await cp(extracted, destination, { recursive: true })
    // PhotoCraft 0.23.1's loader imports app/photocraft-web.js, whose egui
    // imports are relative to app/. Upstream packaged those unchanged snippets
    // only at the archive root. Supply the same files at the imported location.
    if (editor.app === 'photocraft') await cp(join(destination, 'snippets'), join(destination, 'app/snippets'), { recursive: true })
    for (const entry of await readdir(destination, { recursive: true })) {
      if (!entry.endsWith('.js')) continue
      const file = join(destination, entry), source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
        const imported = resolve(dirname(file), match[1])
        if (!imported.startsWith(destination + '/')) throw new Error(`Module import leaves ${editor.app}: ${match[1]}`)
        await access(imported)
      }
    }
    await writeFile(join(destination, '.release'), `layout-v2:${editor.sha256}`)
    console.log(`${editor.app} ${editor.version}: installed`)
  } finally { await rm(staging, { recursive: true, force: true }) }
}
