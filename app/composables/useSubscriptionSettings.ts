import type { CustomField } from '~~/shared/types/vault'
import { validDate } from '~~/shared/utils/subscriptions'

export function useSubscriptionSettings(fields: () => CustomField[]) {
  const subscriptionOpen = ref(false)
  const subscriptionDraft = ref<CustomField | null>(null)
  const subscriptionError = ref('')

  function editSubscription(field: CustomField) {
    subscriptionDraft.value = JSON.parse(JSON.stringify(field))
    subscriptionError.value = ''
    subscriptionOpen.value = true
  }

  function applySubscription() {
    const draft = subscriptionDraft.value, sub = draft?.subscription
    if (!draft || !sub) return
    if (!Number.isFinite(sub.price) || sub.price < 0 || sub.price > 1_000_000_000 ||
      !Number.isInteger(sub.periodCount) || sub.periodCount < 1 || sub.periodCount > 1000 ||
      !validDate(sub.startsOn) || !validDate(sub.paidUntil) || sub.paidUntil < sub.startsOn ||
      (sub.paidFrom && sub.paidFrom > sub.paidUntil)) {
      subscriptionError.value = 'Проверьте стоимость, период и даты подписки.'
      return
    }
    const rules = sub.reminders
    if (rules && (rules.leadDays.some(days => !Number.isInteger(days) || days < 0 || days > 3650) ||
      !Number.isInteger(rules.repeatEveryDays) || rules.repeatEveryDays < 0 || rules.repeatEveryDays > 365 ||
      rules.customDates.some(date => !validDate(date)))) {
      subscriptionError.value = 'Проверьте сроки и даты напоминаний.'
      return
    }
    const field = fields().find(field => field.id === draft.id && field.type === 'subscription')
    if (field) field.subscription = JSON.parse(JSON.stringify(sub))
    subscriptionOpen.value = false
  }

  watch(subscriptionOpen, open => {
    if (!open) { subscriptionDraft.value = null; subscriptionError.value = '' }
  })
  return { subscriptionOpen, subscriptionDraft, subscriptionError, editSubscription, applySubscription }
}
