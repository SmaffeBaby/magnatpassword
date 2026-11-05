export default defineEventHandler(async event => readAccountAccessSettings(await requireSharedUser(event)))
