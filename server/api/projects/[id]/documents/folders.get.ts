export default defineEventHandler(async event => readProjectDocumentFolders(event, await readProjectDocuments(event)))
