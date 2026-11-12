import { z } from 'zod'
import { counterpartySchema } from './estimate'
export const companyInputSchema = counterpartySchema.omit({ id: true, catalogId: true, isOwnLegalEntity: true }).extend({ isOwnLegalEntity: z.boolean() }).strict()
export type CompanyInput = z.infer<typeof companyInputSchema>
export const companyFields = [{ key: 'company', label: 'Компания', max: 160 }, { key: 'inn', label: 'ИНН', max: 12 }, { key: 'kpp', label: 'КПП', max: 9 }, { key: 'ogrn', label: 'ОГРН / ОГРНИП', max: 15 }, { key: 'address', label: 'Адрес', max: 500 }] as const
export function newCompanyDraft(search = '', own = false): CompanyInput {
  const text = search.trim(), digits = text.replace(/\s/g, ''), isInn = /^\d{1,12}$/.test(digits)
  return { company: isInn ? '' : text.slice(0, 160), inn: isInn ? digits : '', kpp: '', ogrn: '', director: '', address: '', bankAccount: '', isOwnLegalEntity: own }
}
export const companyUpdateSchema = companyInputSchema.extend({ revision: z.number().int().positive() }).strict()
export const companyLinkSchema = z.object({ catalogId: z.uuid(), revision: z.number().int().min(0) }).strict()
