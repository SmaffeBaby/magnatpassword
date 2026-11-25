import { z } from 'zod'

const bytes = z.number().int().nonnegative()
export const capacitySchema = z.object({ totalBytes: bytes, availableBytes: bytes })
const serviceSchema = z.object({
  service: z.string(),
  name: z.string(),
  state: z.string(),
  writableBytes: bytes.nullable(),
  totalBytes: bytes.nullable(),
})

export const dockerMetricsSchema = z.object({
  sampledAt: z.iso.datetime(),
  cpuPercent: z.number().min(0).max(100).nullable(),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  memory: capacitySchema,
  disk: capacitySchema,
  services: z.array(serviceSchema).nullable(),
  servicesSampledAt: z.iso.datetime().nullable(),
  storage: z.object({
    imageBytes: bytes.nullable(),
    writableBytes: bytes.nullable(),
    volumeBytes: bytes.nullable(),
    buildCacheBytes: bytes.nullable(),
    exclusiveCacheBytes: bytes.nullable(),
    appImageBytes: bytes.nullable(),
    totalBytes: bytes.nullable(),
  }).nullish(),
  storageSampledAt: z.iso.datetime().nullish(),
})

export type AdminMetrics = {
  onlineUsers: number | null
  docker: z.infer<typeof dockerMetricsSchema> | null
  releasesDisk: z.infer<typeof capacitySchema> | null
}
