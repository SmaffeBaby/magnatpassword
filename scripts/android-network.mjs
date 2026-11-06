import { X509Certificate } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Trust an explicitly supplied office CA only for this application's server host.
// Certificate validation remains enabled; no global Android trust change is needed.
export function writeAndroidNetworkSecurity(server, directory) {
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  let domain = ''
  if (server.protocol === 'http:') {
    domain = `<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">${xml(server.hostname)}</domain></domain-config>`
  } else if (process.env.MAGNAT_ANDROID_CA_CERT) {
    const pem = readFileSync(process.env.MAGNAT_ANDROID_CA_CERT)
    const certificate = new X509Certificate(pem)
    if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now() || Date.parse(certificate.validFrom) > Date.now()) {
      throw new Error('MAGNAT_ANDROID_CA_CERT must be a currently valid public CA certificate')
    }
    const raw = resolve(directory, '../raw')
    mkdirSync(raw, { recursive: true })
    writeFileSync(resolve(raw, 'magnat_server_ca.crt'), certificate.toString())
    domain = `<domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">${xml(server.hostname)}</domain><trust-anchors><certificates src="system"/><certificates src="@raw/magnat_server_ca"/></trust-anchors></domain-config>`
  }
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, 'network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"/>${domain}</network-security-config>\n`)
}
