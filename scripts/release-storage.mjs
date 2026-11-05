import { realpathSync, statSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
export function assertInside(root, path) {
  const result = relative(realpathSync(root), realpathSync(path))
  if (result.startsWith('..') || isAbsolute(result)) throw new Error(`Path must be on the configured SSD: ${path}`)
}
export function releaseStorage() {
  const { MAGNAT_SSD_ROOT: ssd, MAGNAT_RELEASES_DIR: releases, GITHUB_RUN_ID: run, GITHUB_RUN_ATTEMPT: attempt } = process.env
  if (!ssd || !releases || !/^\d+$/.test(run || '') || !/^\d+$/.test(attempt || '')) throw new Error('Configure MAGNAT_SSD_ROOT, MAGNAT_RELEASES_DIR and run identifiers')
  if (!statSync(ssd).isDirectory() || !statSync(releases).isDirectory()) throw new Error('Connect the release SSD first')
  assertInside(ssd, process.cwd())
  assertInside(ssd, releases)
  for (const name of ['CARGO_HOME', 'CARGO_TARGET_DIR', 'GRADLE_USER_HOME', 'NPM_CONFIG_CACHE', 'RUSTUP_HOME', 'TMPDIR']) {
    if (!process.env[name]) throw new Error(`Configure ${name} on the SSD runner`)
    assertInside(ssd, process.env[name])
  }
  return { root: resolve(releases), staging: resolve(releases, '.staging', `${run}-${attempt}`) }
}
if (process.argv[1]?.endsWith('release-storage.mjs')) releaseStorage()
