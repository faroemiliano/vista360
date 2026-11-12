import { t, dateLocale } from '../../i18n'
import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization } from '../../api/business'
import { StudioLink } from '../../app/StudioLink'
import { ApiError } from '../../api/client'

export function ClientsPanel({ workspaceId, query, kind, onFilterChange, onRemoved, onExpired }: {
  query: string; kind: string; onFilterChange: (query: string, kind: string) => void;
  workspaceId: string;
  onRemoved: (id: string) => void; onExpired: () => void
}) {
  const [clients, setClients] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    businessApi.organizations(false, workspaceId).then((rows) => {
      if (active) setClients(rows.sort((a, b) => a.name.localeCompare(b.name, dateLocale())))
    }).catch((cause: Error) => {
      if (!active) return
      setError(cause.message)
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [version, workspaceId])
  const visible = clients.filter((client) => (kind === 'all' || (kind === 'individual' ? client.kind === 'individual' : client.kind !== 'individual'))
    && [client.name, client.legal_name, client.email, client.phone, client.locality, client.contact_name].some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  async function remove(client: Organization) {
    const section = client.kind === 'individual' ? t("Particulares") : t("Organizaciones")
    if (!window.confirm(t("¿Eliminar al cliente {0}? También dejará de aparecer en {1}. Sus trabajos, recorridos y enlaces publicados se conservarán.", [client.name, section]))) return
    setBusy(true); setError('')
    try {
      await businessApi.deleteOrganization(client.id)
      setClients((rows) => rows.filter((row) => row.id !== client.id))
      onRemoved(client.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo eliminar al cliente.")) }
    finally { setBusy(false) }
  }
  return <section>
    <p className="eyebrow mb-3">{t("Tu cartera")}</p><h2 className="text-3xl">{t("Clientes")}</h2>
    <p className="muted my-4">{t("Todas tus organizaciones y particulares en una sola lista. Registrá los nuevos desde esas secciones del menú.")}</p>
    {error && <div role="alert"><p>{t(error)}</p><button className="mt-3" onClick={() => setVersion((value) => value + 1)}>{t("Reintentar clientes")}</button></div>}
    <div className="my-6 grid max-w-2xl gap-4 sm:grid-cols-[1fr_12rem]">
      <label>{t("Buscar cliente")}<input type="search" value={query} onChange={(event) => onFilterChange(event.target.value, kind)} placeholder={t("Nombre, email, teléfono o localidad")} /></label>
      <label>{t("Tipo de cliente")}<select value={kind} onChange={(event) => onFilterChange(query, event.target.value)}><option value="all">{t("Todos")}</option><option value="organization">{t("Organizaciones")}</option><option value="individual">{t("Particulares")}</option></select></label>
    </div>
    {loading ? <p role="status">{t("Consultando clientes…")}</p> : <>
      <p className="mb-4 text-sm text-muted">{visible.length} {visible.length === 1 ? t("cliente") : t("clientes")}</p>
      {!visible.length && !error && <p className="card p-6 text-sm text-muted">{clients.length ? t("No hay clientes que coincidan con tu búsqueda.") : t("Todavía no hay clientes. Creá una organización o un particular desde el menú para comenzar.")}</p>}
      {!!visible.length && <div className="max-w-full overflow-x-auto rounded-xl border border-line" role="region" aria-label={t("Tabla de clientes")} tabIndex={0}>
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm" aria-label={t("Clientes")}>
          <thead className="bg-surface-850 text-xs text-muted"><tr>
            <th scope="col" className="px-4 py-3 font-medium">{t("Cliente")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("Tipo")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("Contacto")}</th>
            <th scope="col" className="px-4 py-3 font-medium">{t("Localidad")}</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">{t("Acciones")}</th>
          </tr></thead>
          <tbody>{visible.map((client) => <tr key={client.id} className="border-t border-line bg-surface-900 hover:bg-surface-850">
            <th scope="row" className="whitespace-nowrap px-4 py-2 font-medium">{client.name}</th>
            <td className="whitespace-nowrap px-4 py-2 text-muted">{client.kind === 'individual' ? t("Particular") : t("Organización")}</td>
            <td className="px-4 py-2 text-xs text-muted"><span className="block">{client.email || '—'}</span><span className="block">{client.phone || '—'}</span></td>
            <td className="px-4 py-2 text-muted">{client.locality || '—'}</td>
            <td className="px-4 py-2"><div className="flex justify-end gap-2 whitespace-nowrap [&>*]:min-h-9 [&>*]:px-3 [&>*]:py-1.5 [&>*]:text-xs">
              <StudioLink className="nav-action" to={{ view: 'clients', profileId: client.id }} aria-label={t("Ver ficha de {0}", [client.name])}>{t("Ver ficha")}</StudioLink>
              <StudioLink className="nav-action" reset to={{ view: 'organizations', organizationId: client.id, group: client.kind === 'individual' ? 'individuals' : 'companies' }} aria-label={t("Ver recorridos de {0}", [client.name])}>{t("Ver recorridos")}</StudioLink>
              <StudioLink className="nav-action" reset to={{ view: 'jobs', organizationId: client.id }} aria-label={t("Ver trabajos de {0}", [client.name])}>{t("Ver trabajos")}</StudioLink>
              {client.role === 'owner' && <button className="danger" aria-label={t("Eliminar cliente {0}", [client.name])} disabled={busy} onClick={() => void remove(client)}>{t("Eliminar")}</button>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
