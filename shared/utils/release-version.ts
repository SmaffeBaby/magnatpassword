// Releases use stable major.minor.patch versions; build metadata is not ordered.
export function isNewerVersion(next: string, current: string): boolean {
  const parse = (value: string) => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null
  const a = parse(next), b = parse(current)
  if (!a || !b) return false
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index]! > b[index]!
  }
  return false
}
