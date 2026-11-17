import { z } from 'zod'
import type { OfficeSource } from '../types/office'
export const officeSourceSchema = z.object({ kind: z.enum(['document','input','task','contract','registry']), projectId: z.uuid().optional(), recordId: z.uuid().optional(), fileId: z.uuid() }).strict().refine(s => (['document','input','contract'].includes(s.kind) ? !!s.projectId : true) && (['task','contract','registry'].includes(s.kind) ? !!s.recordId : true))
export function officeFileUrl(source: OfficeSource) { return `/api/office/file?source=${encodeURIComponent(JSON.stringify(source))}` }
