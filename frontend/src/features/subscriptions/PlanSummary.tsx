import type { Subscription } from '../../api/subscriptions'
export const planDate = (value: string) => new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : `${(value / 1024 ** 2).toFixed(1)} MiB`

export function PlanSummary({ data }: { data: Subscription }) {
  const nearStorage = data.plan.storage_limit_bytes && data.usage.storage_reserved_bytes >= data.plan.storage_limit_bytes * .8
  const nearTours = data.plan.published_limit && data.usage.published + data.usage.preparing >= data.plan.published_limit * .8
  return <div>
    <div className="rounded-xl border border-line bg-surface-850 p-4">
      <p className="text-lg font-semibold">{data.plan.name}{data.plan.billing_interval === 'month' ? ' · Mensual' : ''}</p>
      <p className="mt-2 text-sm text-muted">{data.status === 'expired' ? 'Período finalizado' : data.status === 'cancelled' ? 'Cancelación programada: acceso hasta terminar el período' : 'Activo'}</p>
      <p className="mt-2 text-xs text-muted">{data.period_end ? `${data.status === 'expired' ? 'Finalizó el' : 'Vigente hasta el'} ${planDate(data.period_end)}` : 'Tu acceso actual se conserva'}</p>
    </div>
    <dl className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line p-4"><dt className="text-xs text-muted">Recorridos publicados</dt><dd className="mt-2 font-semibold">{data.usage.published}{data.plan.published_limit !== null ? ` de ${data.plan.published_limit}` : ''}</dd>{!!data.usage.preparing && <p className="mt-1 text-xs text-muted">{data.usage.preparing} preparando publicación</p>}</div>
      <div className="rounded-xl border border-line p-4"><dt className="text-xs text-muted">Reserva estimada de almacenamiento</dt><dd className="mt-2 font-semibold">{bytes(data.usage.storage_reserved_bytes)}{data.plan.storage_limit_bytes !== null ? ` de ${bytes(data.plan.storage_limit_bytes)}` : ''}</dd></div>
    </dl>
    {data.plan.scene_limit !== null && <p className="my-3 text-sm text-muted">Hasta {data.plan.scene_limit} ambientes por recorrido.</p>}
    {!data.limits_enabled ? <p className="my-3 text-sm text-muted">Durante esta etapa de pruebas los límites comerciales no bloquean el uso.</p> : data.status === 'expired' ? <p role="status" className="my-3 text-sm">Para volver a publicar o cargar fotos, solicitá renovar el plan. Tus datos y enlaces existentes se conservan.</p> : (nearStorage || nearTours) ? <p role="status" className="my-3 text-sm">Estás cerca del límite de tu plan. Podés liberar espacio, despublicar un recorrido o consultar una ampliación.</p> : null}
    <p className="text-xs leading-relaxed text-muted">Incluye las fotos de tus borradores y recorridos, con un margen reservado para procesarlas y publicarlas.</p>
  </div>
}
