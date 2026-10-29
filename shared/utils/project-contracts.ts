import { z } from 'zod'
import type { EstimateContent } from '../types/estimate'
import type { ProjectContractInput, StoredProjectContract } from '../types/project-contracts'
import { estimateAmounts, estimateFinancials, roundMoney } from './estimate'
export const projectContractSchema = z.object({
  code: z.string().trim().max(30), number: z.string().trim().min(1,'Укажите номер договора').max(100),
  sellerId: z.uuid('Выберите продавца / исполнителя'), buyerId: z.uuid('Выберите покупателя / заказчика'),
  date: z.union([z.literal(''),z.iso.date()]), deadline: z.union([z.literal(''),z.iso.date()]),
  source: z.enum(['revenue','expenses']), itemIds: z.array(z.uuid()).max(200)
}).strict().superRefine((value,ctx)=>{
  if(value.sellerId===value.buyerId)ctx.addIssue({code:'custom',message:'Стороны договора должны различаться'})
  if(value.date&&value.deadline&&value.deadline<value.date)ctx.addIssue({code:'custom',message:'Срок договора не может быть раньше даты договора'})
  if(new Set(value.itemIds).size!==value.itemIds.length)ctx.addIssue({code:'custom',message:'Позиции сметы не должны повторяться'})
  if(value.source==='expenses'&&!value.itemIds.length)ctx.addIssue({code:'custom',message:'Выберите позиции поставщика из сметы'})
  if(value.source==='revenue'&&value.itemIds.length)ctx.addIssue({code:'custom',message:'Клиентский договор использует выручку всей сметы'})
})
export const projectContractWriteSchema = z.object({ estimateRevision:z.number().int().min(0), contract:projectContractSchema }).strict()
export const projectContractUpdateSchema = projectContractWriteSchema.extend({revision:z.number().int().positive()})
export function contractFigures(content: EstimateContent, contract: ProjectContractInput) {
  const seller=content.counterparties.find(party=>party.id===contract.sellerId),buyer=content.counterparties.find(party=>party.id===contract.buyerId)
  const failure=(issue:string)=>({seller:seller?.company??'',buyer:buyer?.company??'',amount:null,vatAmount:null,netAmount:null,issue})
  if(!seller||!buyer)return failure('Выберите обе стороны из компаний проекта')
  if(seller.id===buyer.id)return failure('Стороны договора должны различаться')
  if(seller.isOwnLegalEntity&&buyer.isOwnLegalEntity)return failure('Договор между двумя нашими юридическими лицами запрещён')
  if(contract.source==='revenue') {
    const figures=estimateFinancials(content)
    if(figures.revenue<=0)return failure('Сначала укажите положительную выручку в параметрах сметы')
    return {seller:seller.company,buyer:buyer.company,amount:figures.revenue,vatAmount:figures.outputVat,netAmount:figures.netRevenue,issue:''}
  }
  if(!contract.itemIds.length)return failure('Выберите позиции поставщика из сметы')
  const amounts=estimateAmounts(content.items)
  let amount=0,vatAmount=0
  for(const id of contract.itemIds){
    const index=content.items.findIndex(item=>item.id===id),item=content.items[index]
    if(!item||item.internalCost||item.counterpartyId!==contract.sellerId)return failure('Позиции должны существовать в смете и относиться к продавцу / исполнителю этого договора')
    amount+=amounts[index]!.total;vatAmount+=amounts[index]!.vat
  }
  amount=roundMoney(amount);vatAmount=roundMoney(vatAmount)
  if(amount<=0)return failure('Сумма выбранных позиций сметы должна быть больше нуля')
  return {seller:seller.company,buyer:buyer.company,amount,vatAmount,netAmount:roundMoney(amount-vatAmount),issue:''}
}
export function contractConflict(contract:ProjectContractInput,others:StoredProjectContract[],exceptId=''){
  const rows=others.filter(row=>row.id!==exceptId)
  if(contract.source==='revenue'&&rows.some(row=>row.source==='revenue'))return 'Договор на выручку сметы уже существует. Измените существующий договор.'
  if(contract.source==='expenses'&&rows.some(row=>row.source==='expenses'&&row.itemIds.some(id=>contract.itemIds.includes(id))))return 'Одна из позиций уже используется в другом договоре'
  return ''
}
