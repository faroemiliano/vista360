import { t } from '../../i18n'
import { StudioLink } from '../../app/StudioLink'
import type { useOwnSubscription } from './useOwnSubscription'
import { storageBytes } from './storage'

export function StorageMeter({ state }: { state: ReturnType<typeof useOwnSubscription> }) {
  const { data, error, retry } = state
  const used = data?.usage.storage_used_bytes ?? 0
  const limit = data?.plan.storage_limit_bytes
  return <section aria-label={t('Almacenamiento de tu plan')} className="min-w-0 rounded-xl border border-line bg-surface-900 p-3 text-xs">
    <p className="font-semibold">{t('Almacenamiento de tu plan')}</p>
    {data && <>
      <p className="mt-2 tabular-nums">{limit != null ? t('{0} de {1} utilizados', [storageBytes(used), storageBytes(limit)]) : t('{0} utilizados · Sin límite definido', [storageBytes(used)])}</p>
      {limit != null && <progress aria-label={t('Uso de almacenamiento')} max={limit} value={Math.min(used, limit)} className="mt-2 h-2 w-full accent-accent" />}
      {limit != null && used >= limit * .8 && <p className="mt-1 text-accent">{used >= limit ? t('Alcanzaste el almacenamiento de tu plan.') : t('Te estás acercando al límite de almacenamiento.')}</p>}
    </>}
    {error ? <p className="mt-2 text-muted">{t('No se pudo actualizar el consumo.')} <button className="btn-quiet !min-h-0 !p-1 !text-xs" onClick={retry}>{t('Reintentar')}</button></p> : !data && <p className="mt-2 text-muted">{t('Consultando consumo…')}</p>}
    <StudioLink reset to={{ view: 'account', accountTab: 'plan' }} className="mt-2 inline-flex min-h-8 items-center text-accent underline">{t('Ver consumo')}</StudioLink>
  </section>
}
