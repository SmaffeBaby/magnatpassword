export default defineEventHandler(async event=>{const{estimate,contracts}=await projectContractRegistry(event);return{contracts,estimateRevision:estimate.revision}})
