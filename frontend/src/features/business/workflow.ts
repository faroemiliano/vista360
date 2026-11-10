import { t } from '../../i18n'
import type { ServiceJob } from '../../api/business'

export const statuses: ServiceJob['status'][] = [
  'SOLICITADO', 'PRESUPUESTADO', 'CONFIRMADO', 'EN_PRODUCCION',
  'EN_REVISION', 'PUBLICADO', 'FINALIZADO', 'CANCELADO',
]
export const statusName = (status: string) => t(status.replaceAll('_', ' '))
