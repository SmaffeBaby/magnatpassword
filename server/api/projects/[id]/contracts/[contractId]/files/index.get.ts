export default defineEventHandler(async event => (await readContractFiles(event)).files)
