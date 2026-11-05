import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { releaseStorage } from './release-storage.mjs'
const { root, staging } = releaseStorage()
const release = JSON.parse(readFileSync('.local/release-plan.json', 'utf8'))
if (!existsSync(join(staging, 'ios', `Magnat-${release.version}-ios-unsigned.xcarchive.tar.gz`))) throw new Error('Missing unsigned iOS archive')
const downloads = [], updates = {}
for (const platform of ['windows', 'macos', 'android']) {
  const part = JSON.parse(readFileSync(join(staging, platform, `${platform}.json`), 'utf8'))
  downloads.push(...part.downloads)
  Object.assign(updates, part.updates)
}
const lock = join(root, '.publish-lock')
const fd = openSync(lock, 'wx')
try {
  const target = join(root, release.version)
  if (existsSync(target)) throw new Error(`Release ${release.version} already exists. Set a new version in admin.`)
  const prepared = join(staging, 'published')
  mkdirSync(prepared, { recursive: true })
  for (const platform of ['windows', 'macos', 'android']) {
    for (const name of readdirSync(join(staging, platform)).filter(name => !name.endsWith('.json'))) copyFileSync(join(staging, platform, name), join(prepared, name))
  }
  writeFileSync(join(prepared, 'release.json'), JSON.stringify({ ...release, publishedAt: new Date().toISOString(), downloads, updates }, null, 2))
  renameSync(prepared, target)
  const pointer = join(root, `.latest-${process.env.GITHUB_RUN_ID}.json`)
  writeFileSync(pointer, JSON.stringify({ version: release.version }))
  renameSync(pointer, join(root, 'latest.json'))
} finally { closeSync(fd); unlinkSync(lock) }
