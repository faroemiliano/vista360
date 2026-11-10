import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { businessApi } from '../../api/business'
import type { components } from '../../api/schema'
import { dateLocale, t } from '../../i18n'

type Inbox = components['schemas']['PlatformInbox']

export function PlatformContacts({ query, offset, onFilter, onPage, onExpired }: {
  query: string; offset: number; onFilter: (query: string) => void;
  onPage: (offset: number) => void; onExpired: () => void;
}) {
  const [data, setData] = useState<Inbox | null>(null)
  const [draft, setDraft] = useState(query)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  useEffect(() => setDraft(query), [query])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    businessApi.platformContacts(query, offset).then(result => {
      if (active) setData(result)
    }).catch((cause: unknown) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : t('No se pudieron consultar los mensajes.'))
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, offset, version])
  return <section aria-labelledby="platform-contacts-title">
    <p className="eyebrow mb-3">{t('Administración de Vision360')}</p>
    <h2 id="platform-contacts-title" className="text-3xl">{t('Consultas del sistema')}</h2>
    <p className="my-4 max-w-2xl text-sm text-muted">{t('Mensajes enviados desde el formulario de la página de inicio. Abrí una consulta para ver el mensaje y los datos de contacto.')}</p>
    <form role="search" aria-label={t('Buscar consultas del sistema')} className="my-6 flex max-w-3xl flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); onFilter(draft.trim()) }}>
      <label className="min-w-0 flex-1 basis-56">{t('Buscar consulta')}<input type="search" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} placeholder={t('Email, teléfono o mensaje')} /></label>
      <button type="submit">{t('Buscar')}</button>
      <button type="button" className="btn-quiet" disabled={loading} onClick={() => setVersion(value => value + 1)}>{t('Actualizar')}</button>
    </form>
    {loading && <p role="status">{t('Consultando mensajes…')}</p>}
    {error && <div role="alert"><p>{t(error)}</p><button className="mt-3" onClick={() => setVersion(value => value + 1)}>{t('Reintentar')}</button></div>}
    {data && !loading && <>
      <p role="status" className="mb-4 text-sm text-muted">{t('Consultas encontradas: {0}', [data.total])}</p>
      {!data.items.length ? <p className="rounded-xl border border-line p-6 text-sm text-muted">{t('No hay consultas para esta búsqueda o página.')}</p> : <div className="space-y-3">
        {data.items.map(item => <details key={item.id} className="rounded-xl border border-line bg-surface-900 p-4 sm:p-5">
          <summary className="cursor-pointer break-words text-sm font-semibold"><span className="break-all">{item.email}</span><time dateTime={item.created_at} className="ml-3 inline-block text-xs font-normal text-muted">{new Date(item.created_at).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</time></summary>
          <div className="mt-4 border-t border-line pt-4">
            <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="mb-1 text-xs text-muted">{t('Email de contacto')}</dt><dd className="break-all"><a className="text-accent underline" href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a></dd></div>
              <div><dt className="mb-1 text-xs text-muted">{t('Teléfono de contacto')}</dt><dd className="break-all">{item.phone}</dd></div>
              <div className="min-w-0 sm:col-span-2"><dt className="mb-2 text-xs text-muted">{t('Consulta')}</dt><dd className="whitespace-pre-wrap break-words">{item.message}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3"><a className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold" href={`tel:${item.phone}`}>{t('Llamar')}</a><a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm" href={`mailto:${encodeURIComponent(item.email)}`}>{t('Responder por email')}</a></div>
            <p className="mt-4 break-all text-xs text-muted">{t('Referencia')}: {item.id}</p>
          </div>
        </details>)}
      </div>}
      <div className="mt-5 flex flex-wrap items-center gap-3" aria-label={t('Paginación de consultas')}>
        <button className="btn-quiet" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - data.limit))}>{t('Anterior')}</button>
        <span className="text-xs text-muted">{data.items.length ? `${offset + 1}–${offset + data.items.length}` : '0'} {t('de')} {data.total}</span>
        <button className="btn-quiet" disabled={offset + data.limit >= data.total} onClick={() => onPage(offset + data.limit)}>{t('Siguiente')}</button>
      </div>
    </>}
  </section>
}
