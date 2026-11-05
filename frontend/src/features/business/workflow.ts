import type { ServiceJob } from '../../api/business'

export const statuses: ServiceJob['status'][] = [
  'SOLICITADO', 'PRESUPUESTADO', 'CONFIRMADO', 'EN_PRODUCCION',
  'EN_REVISION', 'PUBLICADO', 'FINALIZADO', 'CANCELADO',
]
export const statusName = (status: string) => status.replaceAll('_', ' ')
