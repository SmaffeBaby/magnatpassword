import { z } from 'zod'
import { counterpartySchema } from './estimate'
export const companyInputSchema = counterpartySchema.omit({ id: true, catalogId: true, isOwnLegalEntity: true }).extend({ isOwnLegalEntity: z.boolean() }).strict()
export const companyUpdateSchema = companyInputSchema.extend({ revision: z.number().int().positive() }).strict()
export const companyLinkSchema = z.object({ catalogId: z.uuid(), revision: z.number().int().min(0) }).strict()
