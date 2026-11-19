import { validDate } from '~~/shared/utils/subscriptions'

export function formatDateInput(value: string | undefined) {
  if (!value) return ''
  if (!validDate(value)) return value
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

export function parseDateInput(value: string): string | null {
  const input = value.trim()
  if (!input) return ''
  if (validDate(input)) return input
  const parts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(input)
  if (!parts) return null
  const [, day, month, year] = parts
  const date = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
  return validDate(date) ? date : null
}
