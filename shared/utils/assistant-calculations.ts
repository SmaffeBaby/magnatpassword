import type { AssistantReply } from '../types/assistant'
import type { AssistantProjectSnapshot } from '../types/assistant-project'
const number = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(n)
const money = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' ₽'
export function isFinancialFormula(question: string) {
  return /формул|как.*(?:счита|рассчит|расч[её]т|получа|складыва)|из чего.*(?:прибыл|выруч|затрат|счита)|почему.*(?:прибыл|выруч|ндс|сумм)|за сч[её]т чего/iu.test(question) && /прибыл|выруч|затрат|ндс|рентабель|нацен|смет|сумм/iu.test(question)
}
export function financialFormulaReply(snapshot?: AssistantProjectSnapshot): AssistantReply {
  const lines = ['В смете проекта используются такие формулы:',
    '• Сумма позиции = количество × цена. Затраты = сумма всех позиций.',
    '• НДС, включённый в сумму = сумма × ставка / (100 + ставка). Сумма без НДС = сумма − НДС.',
    '• Прибыль без НДС = выручка без НДС − затраты без НДС.',
    '• Разница выручки и затрат = выручка с НДС − затраты с НДС.',
    '• Рентабельность = прибыль без НДС / выручка без НДС × 100%. При нулевой выручке она не рассчитывается.',
    'Выручка задаётся в параметрах сметы: вручную, как затраты × (1 + наценка / 100) или как произведение выбранных числовых полей.',
    'Денежные суммы округляются до копеек. Входящий НДС складывается из НДС позиций; у группы НДС округление корректируется на последней позиции.']
  if (snapshot) {
    lines.unshift(`Проект «${snapshot.project.name}».`)
    const f = snapshot.financials || snapshot.process?.estimate
    if (!f) lines.push('Текущие суммы недоступны; расчёт на данных проекта не выполнен.')
    else {
      const d = snapshot.estimate?.details
      lines.push('Расчёт на текущих данных:', `• Затраты без НДС: ${money(f.cost)} − ${money(f.inputVat)} = ${money(f.netCost)}.`, `• Выручка без НДС: ${money(f.revenue)} − ${money(f.outputVat)} = ${money(f.netRevenue)}.`, `• Прибыль: ${money(f.netRevenue)} − ${money(f.netCost)} = ${money(f.profit)}.`, `• Разница с НДС: ${money(f.revenue)} − ${money(f.cost)} = ${money(f.difference)}.`, `• Рентабельность: ${f.netRevenue ? `${money(f.profit)} / ${money(f.netRevenue)} × 100% = ${number((f.profitability || 0) * 100)}%.` : 'не рассчитана: выручка без НДС равна нулю.'}`)
      if (d) {
        lines.push(`• Исходящий НДС: ${money(f.revenue)} × ${d.revenueVatRate}% / (100 + ${d.revenueVatRate}) = ${money(f.outputVat)}.`)
        if (d.revenueMode === 'manual') lines.push(`• Выручка введена вручную: ${money(f.revenue)}.`)
        else if (d.revenueMode === 'markup') lines.push(`• Выручка: ${money(f.cost)} × (1 + ${d.markupPercent} / 100) = ${money(f.revenue)}.`)
        else {
          const fields = (d.revenueFactors || []).map(id => d.fields.find(field => field.id === id))
          lines.push(fields.length && fields.every(field => field && field.value !== '' && Number.isFinite(Number(field.value))) ? `• Выручка по полям: ${fields.map(field => `${field!.label} (${field!.value})`).join(' × ')} = ${money(f.revenue)}.` : '• Для выручки по формуле не хватает заполненных числовых полей; сайт возвращает 0.')
        }
      }
      lines.push('Это показатель выбранного проекта. Для общей прибыли компании нужна отдельная сводка её доходов и расходов.')
    }
  } else lines.push('Для расчёта на текущих данных укажите проект. Показатели проекта считаются по его смете.')
  return { message: lines.join('\n'), draft: null, links: [{ label: snapshot ? 'Открыть смету' : 'Проекты', to: snapshot ? `/projects/${snapshot.project.id}/estimate` : '/projects' }] }
}
// Small bounded arithmetic parser. No eval, executable expressions, variables or API calls.
export function arithmeticValue(expression: string): number {
  const s = expression.replace(/\s/g, '').replace(/,/g, '.').replace(/[×х]/gu, '*').replace(/[÷:]/gu, '/').replace(/−/g, '-')
  if (!s || s.length > 300 || /[^\d.+*/()%-]/u.test(s)) throw new Error('expression')
  let i = 0, steps = 0
  function check(n: number) { if (++steps > 150 || !Number.isFinite(n) || Math.abs(n) > 1e15) throw new Error('range'); return n }
  function atom(depth: number): number {
    if (depth > 20) throw new Error('depth')
    if (s[i] === '+' || s[i] === '-') { const sign = s[i++] === '-' ? -1 : 1; return check(sign * atom(depth + 1)) }
    let n: number
    if (s[i] === '(') { i++; n = add(depth + 1); if (s[i++] !== ')') throw new Error('parenthesis') }
    else { const token = s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/u)?.[0]; if (!token) throw new Error('number'); i += token.length; n = check(Number(token)) }
    if (s[i] === '%') { i++; n /= 100 }
    return check(n)
  }
  function multiply(depth: number) { let n = atom(depth); while (s[i] === '*' || s[i] === '/') { const op = s[i++], right = atom(depth); n = check(op === '*' ? n * right : n / right) } return n }
  function add(depth: number): number { let n = multiply(depth); while (s[i] === '+' || s[i] === '-') { const op = s[i++], right = multiply(depth); n = check(op === '+' ? n + right : n - right) } return n }
  const result = add(0); if (i !== s.length) throw new Error('trailing'); return result
}
export function arithmeticReply(question: string): AssistantReply | null {
  const match = question.trim().match(/^(?:посчитай|рассчитай|вычисли|сколько(?: будет| получится| составляет)?)\s*[:—]?\s*([\d(+-][\s\S]*?)[?=]?$/iu)
  const raw = match?.[1] || (/^[\d\s.,+*/()×÷−%:-]+[?=]?$/u.test(question.trim()) ? question.trim().replace(/[?=]$/u, '') : '')
  if (!raw) return null
  const expression = raw.replace(/\s+процент(?:а|ов)?\s+от\s+/giu, '% * ').replace(/%\s*от\s*/giu, '% * ').replace(/\s+(?:рубл[а-яё]*|₽)\s*$/iu, '')
  try { return { message: `${expression} = ${number(arithmeticValue(expression))}.`, draft: null } }
  catch { return { message: 'Не удалось выполнить расчёт. Напишите числовое выражение с +, −, ×, /, скобками или процентом от суммы. Деление на ноль и слишком большие значения не допускаются.', draft: null } }
}
