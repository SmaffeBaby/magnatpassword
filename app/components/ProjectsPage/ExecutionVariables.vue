<script setup lang="ts">
import { executionVariables } from '~~/shared/utils/project-execution'
defineProps<{disabled?:boolean}>()
const emit=defineEmits<{insert:[variable:string]}>()
const help:Record<typeof executionVariables[number],{title:string;text:string}>={
 project:{title:'Название проекта',text:'Название текущего проекта из его настроек.'},
 contractNumber:{title:'Номер договора',text:'Номер связанного договора из этапа «Договора». Одинаков для договора, приложений и счёта.'},
 contractDate:{title:'Дата договора',text:'Дата подписания, указанная в реестре договоров. Если дата не заполнена, выводится «Не указан».'},
 deadline:{title:'Срок исполнения',text:'Срок исполнения связанного договора из реестра договоров.'},
 number:{title:'Номер текущего документа',text:'Для договора — его номер из реестра. Для приложения, счёта, акта и УПД — номер, заданный в редакторе этого документа.'},
 date:{title:'Дата текущего документа',text:'Для договора — дата из реестра. Для приложения, счёта, акта и УПД — дата, заданная в редакторе.'},
 seller:{title:'Продавец или исполнитель',text:'Название компании, выбранной продавцом / исполнителем в договоре. Реквизиты берутся из общей базы компаний.'},
 buyer:{title:'Покупатель или заказчик',text:'Название компании, выбранной покупателем / заказчиком в договоре.'},
 sellerInn:{title:'ИНН продавца',text:'ИНН компании продавца / исполнителя из общей базы компаний проекта.'},
 buyerInn:{title:'ИНН покупателя',text:'ИНН компании покупателя / заказчика из общей базы компаний проекта.'},
 sellerDirector:{title:'Руководитель продавца',text:'ФИО руководителя продавца / исполнителя из карточки компании. При отсутствии оставляется линия для заполнения.'},
 buyerDirector:{title:'Руководитель покупателя',text:'ФИО руководителя покупателя / заказчика из карточки компании. При отсутствии оставляется линия для заполнения.'},
 contractAmount:{title:'Полная сумма договора',text:'Сумма с НДС из сметы: выручка для договора с заказчиком или сумма выбранных позиций поставщика. Всегда полная сумма, в том числе в счёте на частичную предоплату.'},
 amount:{title:'Сумма текущего документа',text:'В договоре, приложении, акте и УПД — полная сумма договора. В счёте — только предоплата: сумма договора × выбранный процент / 100.'},
 vat:{title:'НДС текущего документа',text:'НДС из расчётов сметы для этого договора. В счёте учитывается только НДС с выбранного процента предоплаты.'},
 net:{title:'Сумма без НДС',text:'Сумма текущего документа минус его НДС. В счёте рассчитывается для предоплаты.'},
 percent:{title:'Процент предоплаты',text:'Процент, выбранный в настройках комплекта документов. Если счёт на предоплату выключен, выводится 0.'},
 balancePercent:{title:'Оставшийся процент',text:'100% минус процент предоплаты. Если предоплата не предусмотрена, выводится 100.'},
 paymentTerms:{title:'Условия оплаты',text:'Автоматический текст о предоплате, её сумме и оставшемся проценте. Если предоплата выключена, текст сообщает, что она не предусмотрена.'},
 positions:{title:'Таблица товаров и услуг',text:'Вставляет таблицу позиций из сметы. В закупочном договоре — выбранные позиции поставщика с ценами. Для заказчика — состав без закупочных цен; в актах и УПД — итоговая стоимость исполнения по договору. В счёте — строка предоплаты. Используется только в тексте документа.'},
 requisites:{title:'Реквизиты сторон',text:'Вставляет названия, ИНН, КПП, руководителей, адреса и расчётные счета обеих сторон из общей базы компаний. Используется только в тексте документа.'}
}
</script>
<template><div class="execution-variable-list" aria-label="Переменные шаблона"><span v-for="variable in executionVariables" :key="variable" class="execution-variable"><button class="execution-variable-insert" :disabled="disabled" :aria-label="`Вставить переменную ${variable}`" @click="emit('insert',variable)" v-text="'{{'+variable+'}}'"/><UPopover><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-info" :aria-label="`Что означает ${variable}`" :title="help[variable].title" class="execution-variable-info"/><template #content><div class="execution-variable-help"><strong>{{help[variable].title}}</strong><code v-text="'{{'+variable+'}}'"/><p>{{help[variable].text}}</p></div></template></UPopover></span></div></template>
<style scoped>
.execution-variable-list{display:flex;flex-wrap:wrap;gap:8px}.execution-variable{display:inline-flex;align-items:center;border:1px solid #e6e9ef;background:#f1f3f7;border-radius:8px;overflow:hidden}.execution-variable-insert{padding:7px 4px 7px 10px;font-size:12px;color:#64748b}.execution-variable-insert:disabled{opacity:.6}.execution-variable-insert:focus-visible{outline:2px solid var(--ui-primary);outline-offset:-2px}.execution-variable-info{margin-right:3px}.execution-variable-help{padding:18px;width:300px;max-width:calc(100vw - 40px);font-size:13px;line-height:1.6;color:#64748b}.execution-variable-help strong{display:block;color:#334155;font-size:14px}.execution-variable-help code{display:block;font-size:11px;margin:6px 0 10px;color:#8292a8}.execution-variable-help p{margin:0}
</style>
