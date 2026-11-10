import { t } from '../../i18n'
import type { PlanCode } from '../../api/subscriptions'
export type PublicPlanCode = Exclude<PlanCode, 'legacy'>
export const publicPlanNames: Record<PublicPlanCode, string> = { get trial() { return t('Prueba') }, get professional() { return t('Profesional') }, get studio() { return t('Estudio') } }
export function publicPlan(value: string | null): PublicPlanCode | '' {
  return value === 'trial' || value === 'professional' || value === 'studio' ? value : ''
}
export const planRegistrationUrl = (code: PublicPlanCode) => `/studio?registro=1&plan=${code}`
