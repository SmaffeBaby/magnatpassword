export default defineEventHandler(async event=>visibleSharedCards(event,await requireSharedUser(event)))
