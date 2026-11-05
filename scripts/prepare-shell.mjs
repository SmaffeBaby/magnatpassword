import { loadEnvFile } from 'node:process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { shellConfig } from './shell-config.mjs'
try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
const platform = process.argv[2] || process.env.RELEASE_PLATFORM
const base = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const server = new URL(process.env.MAGNAT_SERVER_URL || new URL(base.build.frontendDist).origin)
const config = shellConfig(server.origin, process.env.MAGNAT_SHELL_VERSION || base.version)
mkdirSync('.local', { recursive: true })
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const exceptions = server.protocol === 'http:' ? `<key>NSExceptionDomains</key><dict><key>${xml(server.hostname)}</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict></dict>` : ''
const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>NSLocalNetworkUsageDescription</key><string>Подключение к серверу Magnat в вашей локальной сети.</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/>${exceptions}</dict></dict></plist>\n`
if (platform === 'ios' || platform === 'macos') {
  writeFileSync(`.local/Info.shell.${platform}.plist`, plist)
  config.bundle[platform === 'ios' ? 'iOS' : 'macOS'] = {
    infoPlist: `../.local/Info.shell.${platform}.plist`,
    ...(platform === 'ios' && process.env.MAGNAT_IOS_TEAM ? { developmentTeam: process.env.MAGNAT_IOS_TEAM } : {})
  }
}
if (platform === 'android') {
  const dir = 'src-tauri/gen/android/app/src/main/res/xml'
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/network_security_config.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"/>${server.protocol === 'http:' ? `<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">${xml(server.hostname)}</domain></domain-config>` : ''}</network-security-config>\n`)
}
writeFileSync(`.local/tauri.shell.${platform}.json`, JSON.stringify(config, null, 2))
