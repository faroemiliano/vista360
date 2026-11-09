import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { components } from '../../api/schema'
import { ManageSubscription } from '../subscriptions/ManageSubscription'
import { ApiError } from '../../api/client'

type Directory = components['schemas']['AccountDirectory']
const date = (value: string) => new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })

export function RegisteredAccounts({ query, kind, offset, onFilter, onPage, onExpired }: {
  query: string; kind: string; offset: number;
  onFilter: (query: string, kind: string) => void; onPage: (offset: number) => void; onExpired: () => void;
}) {
  const [selected, setSelected] = useState<Directory['items'][number] | null>(null)
  const [data, setData] = useState<Directory | null>(null)
  const [draft, setDraft] = useState(query)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const filterKind = kind === 'individual' || kind === 'company' ? kind : 'all'
  useEffect(() => setDraft(query), [query])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    businessApi.registeredAccounts(query, filterKind, offset).then(result => {
      if (active) setData(result)
    }).catch((cause: unknown) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las cuentas.')
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, filterKind, offset, version])
  return <section aria-labelledby="registered-accounts-title">
    <p className="eyebrow mb-3">Administración de Vision360</p>
    <h2 id="registered-accounts-title" className="text-3xl">Usuarios registrados</h2>
    <p className="my-4 max-w-2xl text-sm text-muted">Personas y empresas con una cuenta en el sistema. Esta lista incluye tu cuenta de administración; los clientes que cada estudio registra en sus trabajos se gestionan por separado.</p>
    {data && <dl className="my-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de registros">
      {([
        ['Cuentas registradas', data.summary.total], ['Particulares', data.summary.individuals],
        ['Empresas', data.summary.companies], ['Emails verificados', data.summary.verified],
      ] as const).map(([label, value]) => <div className="rounded-xl border border-line bg-surface-900 p-4" key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}
    </dl>}
    <form role="search" aria-label="Buscar usuarios registrados" className="my-6 flex max-w-3xl flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); onFilter(draft.trim(), filterKind) }}>
      <label className="min-w-0 flex-[2] basis-56">Buscar cuenta<input type="search" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Nombre, email, teléfono o estudio" /></label>
      <label className="min-w-0 flex-1 basis-36">Tipo de cuenta<select value={filterKind} onChange={event => onFilter(draft.trim(), event.target.value)}><option value="all">Todas</option><option value="individual">Particular</option><option value="company">Empresa</option></select></label>
      <button type="submit">Buscar</button>
    </form>
    {loading && <p role="status">Consultando usuarios registrados…</p>}
    {error && <div role="alert"><p>{error}</p><button className="mt-3" onClick={() => setVersion(value => value + 1)}>Reintentar</button></div>}
    {data && !loading && <>
      <p role="status" className="mb-4 text-sm text-muted">{data.filtered_total} {data.filtered_total === 1 ? 'cuenta encontrada' : 'cuentas encontradas'}</p>
      {!data.items.length ? <p className="rounded-xl border border-line p-6 text-sm text-muted">No hay cuentas para esta búsqueda o página.</p> : <div className="max-w-full overflow-x-auto rounded-xl border border-line" role="region" aria-label="Tabla de usuarios registrados" tabIndex={0}>
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm" aria-label="Usuarios registrados">
          <thead className="bg-surface-850 text-xs text-muted"><tr>{['Cuenta', 'Contacto', 'Tipo', 'Estudio', 'Registro', 'Email', 'Plan'].map(label => <th className="px-4 py-3 font-medium" scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.items.map(user => <tr key={user.id} className="border-t border-line bg-surface-900 hover:bg-surface-850">
            <th scope="row" className="px-4 py-3 font-medium"><span className="block">{user.display_name || 'Sin nombre cargado'}</span>{user.platform_admin && <span className="mt-1 block text-xs text-accent">Administrador del sistema</span>}</th>
            <td className="px-4 py-3 text-xs text-muted"><span className="block break-all">{user.email}</span><span className="mt-1 block">{user.phone || 'Sin teléfono'}</span></td>
            <td className="px-4 py-3 text-muted"><span className="block">{user.account_kind === 'company' ? 'Empresa' : 'Particular'}</span>{user.company_name && <span className="block text-xs">{user.company_name}</span>}</td>
            <td className="px-4 py-3 text-muted">{user.studio_name || 'Sin estudio'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted"><time dateTime={user.created_at}>{date(user.created_at)}</time></td>
            <td className="px-4 py-3 text-xs"><span className={user.email_verified ? 'text-accent' : 'text-muted'}>{user.email_verified ? 'Verificado' : 'Sin verificar'}</span></td>
            <td className="px-4 py-3"><p className="whitespace-nowrap font-medium">{user.plan?.name || 'Sin estudio'}</p>{user.plan && <p className="mb-2 mt-1 text-xs text-muted">{user.plan.status === 'expired' ? 'Vencido' : user.plan.status === 'cancelled' ? 'Cancelación programada' : 'Activo'}</p>}<button className="whitespace-nowrap !px-3 !py-2 !text-xs" aria-label={`Gestionar plan de ${user.email}`} onClick={() => setSelected(user)}>Gestionar plan</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="mt-4 flex flex-wrap items-center gap-3" aria-label="Paginación de usuarios">
        <button className="btn-quiet" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - data.limit))}>Anterior</button>
        <span className="text-xs text-muted">{data.items.length ? `${offset + 1}–${offset + data.items.length}` : '0'} de {data.filtered_total}</span>
        <button className="btn-quiet" disabled={offset + data.limit >= data.filtered_total} onClick={() => onPage(offset + data.limit)}>Siguiente</button>
      </div>
      <p className="mt-5 text-xs text-muted">Los datos de contacto y el tipo de cuenta provienen de «Mi cuenta». «Verificado» indica que se confirmó el email, no la identidad o la empresa.</p>
    </>}
    {selected && <ManageSubscription key={selected.id} userId={selected.id} email={selected.email} onClose={() => { setSelected(null); setVersion(value => value + 1) }} />}
  </section>
}
