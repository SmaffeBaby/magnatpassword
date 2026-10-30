export default defineEventHandler(async event=>(await readProjectInputs(event)).state)
