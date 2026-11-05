import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization } from '../../api/business'
import { ClientProfile } from './ClientProfile'
import { ApiError } from '../../api/client'

export function ClientsPanel({ workspaceId, query, kind, onFilterChange, onOpen, onJobs, onRemoved, onExpired }: {
  query: string; kind: string; onFilterChange: (query: string, kind: string) => void;
  workspaceId: string;
  onOpen: (client: Organization) => void; onJobs: (id: string) => void;
  onRemoved: (id: string) => void; onExpired: () => void
}) {
  const [profile, setProfile] = useState<Organization | null>(null)
  const [clients, setClients] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    businessApi.organizations(false, workspaceId).then((rows) => {
      if (active) setClients(rows.sort((a, b) => a.name.localeCompare(b.name, 'es')))
    }).catch((cause: Error) => {
      if (!active) return
      setError(cause.message)
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [version, workspaceId])
  const visible = clients.filter((client) => (kind === 'all' || (kind === 'individual' ? client.kind === 'individual' : client.kind !== 'individual'))
    && [client.name, client.legal_name, client.email, client.phone, client.locality, client.contact_name].some((value) => value?.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))))
  async function remove(client: Organization) {
    const section = client.kind === 'individual' ? 'Particulares' : 'Organizaciones'
    if (!window.confirm(`¿Eliminar al cliente ${client.name}? También dejará de aparecer en ${section}. Sus trabajos, recorridos y enlaces publicados se conservarán.`)) return
    setBusy(true); setError('')
    try {
      await businessApi.deleteOrganization(client.id)
      setClients((rows) => rows.filter((row) => row.id !== client.id))
      onRemoved(client.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar al cliente.') }
    finally { setBusy(false) }
  }
  if (profile) return <ClientProfile key={profile.id} client={profile} onClose={() => setProfile(null)} onSaved={(saved) => { setProfile(saved); setClients((rows) => rows.map((row) => row.id === saved.id ? saved : row)) }} />
  return <section>
    <p className="eyebrow mb-3">Tu cartera</p><h2 className="text-3xl">Clientes</h2>
    <p className="muted my-4">Todas tus organizaciones y particulares en una sola lista. Registrá los nuevos desde esas secciones del menú.</p>
    {error && <div role="alert"><p>{error}</p><button className="mt-3" onClick={() => setVersion((value) => value + 1)}>Reintentar clientes</button></div>}
    <div className="my-6 grid max-w-2xl gap-4 sm:grid-cols-[1fr_12rem]">
      <label>Buscar cliente<input type="search" value={query} onChange={(event) => onFilterChange(event.target.value, kind)} placeholder="Nombre, email, teléfono o localidad" /></label>
      <label>Tipo de cliente<select value={kind} onChange={(event) => onFilterChange(query, event.target.value)}><option value="all">Todos</option><option value="organization">Organizaciones</option><option value="individual">Particulares</option></select></label>
    </div>
    {loading ? <p role="status">Consultando clientes…</p> : <>
      <p className="mb-4 text-sm text-muted">{visible.length} {visible.length === 1 ? 'cliente' : 'clientes'}</p>
      {!visible.length && !error && <p className="card p-6 text-sm text-muted">{clients.length ? 'No hay clientes que coincidan con tu búsqueda.' : 'Todavía no hay clientes. Creá una organización o un particular desde el menú para comenzar.'}</p>}
      {!!visible.length && <div className="max-w-full overflow-x-auto rounded-xl border border-line" role="region" aria-label="Tabla de clientes" tabIndex={0}>
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm" aria-label="Clientes">
          <thead className="bg-surface-850 text-xs text-muted"><tr>
            <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
            <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
            <th scope="col" className="px-4 py-3 font-medium">Contacto</th>
            <th scope="col" className="px-4 py-3 font-medium">Localidad</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
          </tr></thead>
          <tbody>{visible.map((client) => <tr key={client.id} className="border-t border-line bg-surface-900 hover:bg-surface-850">
            <th scope="row" className="whitespace-nowrap px-4 py-2 font-medium">{client.name}</th>
            <td className="whitespace-nowrap px-4 py-2 text-muted">{client.kind === 'individual' ? 'Particular' : 'Organización'}</td>
            <td className="px-4 py-2 text-xs text-muted"><span className="block">{client.email || '—'}</span><span className="block">{client.phone || '—'}</span></td>
            <td className="px-4 py-2 text-muted">{client.locality || '—'}</td>
            <td className="px-4 py-2"><div className="flex justify-end gap-2 whitespace-nowrap [&>button]:min-h-9 [&>button]:px-3 [&>button]:py-1.5 [&>button]:text-xs">
              <button aria-label={`Ver ficha de ${client.name}`} disabled={busy} onClick={() => setProfile(client)}>Ver ficha</button>
              <button aria-label={`Ver recorridos de ${client.name}`} onClick={() => onOpen(client)}>Ver recorridos</button>
              <button aria-label={`Ver trabajos de ${client.name}`} onClick={() => onJobs(client.id)}>Ver trabajos</button>
              {client.role === 'owner' && <button className="danger" aria-label={`Eliminar cliente ${client.name}`} disabled={busy} onClick={() => void remove(client)}>Eliminar</button>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>
}
