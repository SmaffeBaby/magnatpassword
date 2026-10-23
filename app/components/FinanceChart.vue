<script setup lang="ts">
import type { FinanceMonth } from '~~/shared/types/finances'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{monthly:FinanceMonth[];distribution:{key:string;label:string;value:number}[];currency:string}>()
const emit=defineEmits<{open:[entry:ScopedCredential]}>()
const {canvas,groupCanvas,host,services,serviceColor,money,share}=useFinanceChart(props,entry=>emit('open',entry))
</script>
<template>
 <div ref="host" class="finance-charts">
  <section>
   <h3>По месяцам · {{ currency }}</h3>
   <p class="finance-stack-hint">В каждом месяце слева — план, справа — оплачено. Цветные части показывают вклад каждой услуги в общую сумму. Нажмите на услугу, чтобы открыть карточку.</p>
   <div class="finance-service-legend" aria-label="Услуги на графике"><template v-for="service in services" :key="service.key"><button v-if="service.entry" type="button" @click="emit('open',service.entry)"><i :style="{background:serviceColor(service.key)}" aria-hidden="true"/><span>{{ service.label }}</span></button><span v-else class="finance-service-unavailable"><i :style="{background:serviceColor(service.key)}" aria-hidden="true"/>{{ service.label }}</span></template></div>
   <svg ref="canvas" role="group" :aria-label="`Плановые списания и отмеченные оплаты по месяцам с разбивкой по услугам в ${currency}`"/>
   <p v-if="!services.length" class="subscription-note">В выбранном периоде и валюте нет списаний.</p>
   <details><summary>Данные графика</summary><div class="finance-table-scroll"><table class="finance-table"><thead><tr><th>Месяц / услуга</th><th>План</th><th>Оплачено</th></tr></thead><tbody><template v-for="item in monthly" :key="item.key"><tr class="finance-month-total"><td>{{ item.label }} · Итого</td><td>{{ money(item.planned) }}</td><td>{{ money(item.paid) }}</td></tr><tr v-for="segment in item.plannedSegments" :key="`plan/${segment.key}`"><td><button v-if="segment.entry" type="button" class="subscription-service" @click="emit('open',segment.entry)">{{ segment.label }}</button><span v-else>{{ segment.label }}</span></td><td>{{ money(segment.amount) }}<small>{{ share(segment.amount,item.planned) }}</small></td><td>—</td></tr><tr v-for="segment in item.paidSegments" :key="`paid/${segment.key}`"><td><button v-if="segment.entry" type="button" class="subscription-service" @click="emit('open',segment.entry)">{{ segment.label }}</button><span v-else>{{ segment.label }}</span></td><td>—</td><td>{{ money(segment.amount) }}<small>{{ share(segment.amount,item.paid) }}</small></td></tr></template></tbody></table></div></details>
  </section>
  <section><h3>План по хранилищам · {{ currency }}</h3><svg ref="groupCanvas" role="img" :aria-label="`Плановые расходы по хранилищам в ${currency}`"/><p v-if="!distribution.length" class="subscription-note">В выбранной валюте нет плановых списаний.</p><div v-for="item in distribution" :key="item.key" class="finance-group-total"><span>{{ item.label }}</span><strong>{{ money(item.value) }}</strong></div></section>
 </div>
</template>
