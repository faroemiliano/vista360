import { useEffect, useRef, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Client, Member, Organization, Property } from '../../api/business'
import type { Tour } from '../../api/client'
import type { components } from '../../api/schema'
import { ToursPanel } from '../tours/ToursPanel'
import { useNavigationDirty } from '../../app/navigation'

import { ClientFields, ClientProfile, clientDetails } from './ClientProfile'

const roles = { owner: 'Propietario', admin: 'Administrador', editor: 'Editor / fotógrafo', viewer: 'Sólo lectura' }
export function OrganizationsPanel({ workspaceId, canCreateClients, onExpired, initialOrganizationId, initialTab = 'properties', autoSelect = false, onOrganizationChange, onSectionChange, group = 'all', onNewWork, initialTourId, onOpenOrganization, onDirectory, onTourChange }: {
  initialTourId?: string; onOpenOrganization?: (id: string) => void; onDirectory?: () => void; onTourChange?: (id: string) => void;
  workspaceId: string; canCreateClients: boolean;
  group?: 'all' | 'companies' | 'individuals'; onNewWork?: (organizationId: string) => void;
  onExpired: () => void; initialOrganizationId?: string; initialTab?: string; autoSelect?: boolean;
  onOrganizationChange?: (id: string) => void; onSectionChange?: (tab: string) => void
}) {
  const entryResolved = useRef(false)
  const [dirty, setDirty] = useNavigationDirty()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [profile, setProfile] = useState<Organization | null>(null)
  const [selected, setSelected] = useState<Organization | null>(null)
  const [tab, setTab] = useState(initialTab)
  const [propertyDraft, setPropertyDraft] = useState<Property | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tours, setTours] = useState<Tour[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const writable = selected && selected.role !== 'viewer'
  const manageable = selected && ['owner', 'admin'].includes(selected.role)
  useEffect(() => {
    let active = true
    businessApi.organizations(Boolean(initialOrganizationId), workspaceId).then((rows) => {
      if (!active) return
      setOrganizations(rows)
      if (!entryResolved.current) {
        entryResolved.current = true
        const preferred = initialOrganizationId ? rows.find((org) => org.id === initialOrganizationId) : undefined
        if (initialOrganizationId && !preferred) setError('Cliente no encontrado en este estudio.')
        if (preferred || (autoSelect && !initialOrganizationId && rows.length === 1)) setSelected(preferred || rows[0])
      } else if (selected) {
        setSelected(rows.find((org) => org.id === selected.id) || null)
      }
    })
      .catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [version])
  useEffect(() => {
    setPropertyDraft(null)
    if (selected) onOrganizationChange?.(selected.id)
  }, [selected?.id, onOrganizationChange])
  useEffect(() => {
    if (!selected) return
    let active = true
    setProperties([]); setClients([]); setTours([]); setMembers([])
    Promise.all([businessApi.properties(selected.id), businessApi.clients(selected.id), businessApi.tours(selected.id)])
      .then(([props, people, projects]) => { if (active) { setProperties(props); setClients(people); setTours(projects) } })
      .catch((cause: Error) => { if (active) setError(cause.message) })
    if (manageable) businessApi.members(selected.id).then((rows) => { if (active) setMembers(rows) }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [selected?.id, selected?.role, version])
  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); setVersion((value) => value + 1) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.') }
    finally { setBusy(false) }
  }
  const visibleOrganizations = organizations.filter((org) => !org.deleted_at && (group === 'all' || (group === 'individuals' ? org.kind === 'individual' : org.kind !== 'individual')))
  async function removeOrganization(org: Organization) {
    const label = org.kind === 'individual' ? 'el particular' : 'la organización'
    if (!window.confirm(`¿Eliminar ${label} ${org.name} de la lista? Sus trabajos, recorridos, fotos y enlaces publicados se conservarán.`)) return
    await act(async () => {
      await businessApi.deleteOrganization(org.id)
      if (selected?.id === org.id) { setSelected(null); onDirectory?.() }
      onOrganizationChange?.('')
    })
  }
  function openProfile(org: Organization) {
    if (dirty && !window.confirm('¿Descartar los cambios sin guardar y abrir la ficha?')) return
    setDirty(false); setProfile(org)
  }
  const directoryTitle = group === 'individuals' ? 'Particulares' : 'Organizaciones'
  const sectionTitle = ({ properties: 'Propiedades', members: 'Equipo', tours: 'Recorridos' } as Record<string, string>)[tab] || 'Organizaciones y proyectos'
  if (profile) return <ClientProfile key={profile.id} client={profile} onClose={() => setProfile(null)} onSaved={(saved) => { setProfile(saved); setOrganizations((rows) => rows.map((row) => row.id === saved.id ? saved : row)); if (selected?.id === saved.id) setSelected(saved) }} />
  return <section>
    <p className="eyebrow mb-3">Vision360 Platform</p><h2 className="text-3xl">{selected || autoSelect ? sectionTitle : directoryTitle}</h2><p className="muted my-4">{selected ? `Gestioná ${sectionTitle.toLowerCase()} de ${selected.name}.` : autoSelect ? `Elegí una organización para abrir ${sectionTitle.toLowerCase()}.` : group === 'individuals' ? 'Abrí una persona para ver sus recorridos o preparar un nuevo trabajo.' : 'Abrí una inmobiliaria o empresa para ver sus recorridos y trabajos.'}</p>
    {error && <p role="alert">{error}</p>}
    {!selected && notice && <p role="status" className="mb-5 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-accent">{notice}</p>}
    {!selected ? <div className={`grid items-start gap-6 ${canCreateClients ? 'lg:grid-cols-[1fr_22rem]' : ''}`}>
      <div className="space-y-3">{loading && <p role="status">Consultando tus organizaciones…</p>}{!loading && !visibleOrganizations.length && <p className="card p-6 text-sm text-muted">Todavía no hay registros en esta sección. Agregá {group === 'individuals' ? 'un particular' : 'una organización'} para reunir sus recorridos.</p>}{visibleOrganizations.map((org) => <article key={org.id} className="card flex flex-wrap items-center justify-between gap-4 p-5"><div><h3>{org.name}</h3><p className="muted mt-2">{org.kind === 'individual' ? 'Particular' : org.kind === 'photographer' ? 'Fotógrafo profesional' : org.kind === 'agency' ? 'Inmobiliaria' : org.kind === 'studio' ? 'Estudio' : 'Empresa'} · {roles[org.role]}</p></div><button aria-label={`Ver ficha de ${org.name}`} disabled={busy} onClick={() => openProfile(org)}>Ver ficha</button><button aria-label={`${org.kind === 'individual' ? 'Abrir particular' : 'Abrir organización'} ${org.name}`} onClick={() => { if (onOpenOrganization) onOpenOrganization(org.id); else { setSelected(org); setPropertyDraft(null) } }}>Ver recorridos</button>{org.role === 'owner' && <button className="danger" aria-label={`Eliminar ${org.kind === 'individual' ? 'particular' : 'organización'} ${org.name}`} disabled={busy} onClick={() => void removeOrganization(org)}>Eliminar</button>}</article>)}</div>
      {canCreateClients && <form className="card p-5" aria-label={group === 'individuals' ? 'Crear particular' : 'Crear organización'} onChange={() => setDirty(true)} onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
        void act(async () => {
          const org = await businessApi.createOrganization({ workspace_id: workspaceId, ...clientDetails(data), kind: group === 'individuals' ? 'individual' : String(data.get('kind')) as Organization['kind'] })
          entryResolved.current = true
          onOrganizationChange?.(org.id)
          form.reset(); setDirty(false)
          setNotice(`${org.name} se creó correctamente. Elegí «Ver recorridos» en su ficha cuando quieras continuar.`)
        })
      }}><h3 className="mb-5">{group === 'individuals' ? 'Nuevo particular' : 'Nueva organización'}</h3><ClientFields individual={group === 'individuals'} />{group !== 'individuals' && <label>Tipo de organización<select name="kind" defaultValue="agency"><option value="agency">Inmobiliaria</option><option value="photographer">Fotógrafo profesional</option><option value="company">Empresa</option></select></label>}<p className="muted mb-5">Guardá aquí los recorridos de {group === 'individuals' ? 'esta persona' : 'esta inmobiliaria o empresa'}. Es un cliente de tu estudio y no necesita una cuenta de acceso.</p><button className="btn-primary w-full" disabled={busy || loading}>{group === 'individuals' ? 'Crear particular' : 'Crear organización'}</button></form>}
    </div> : <>
      <div className="my-6 flex flex-wrap items-center justify-between gap-3"><button onClick={() => { if (onDirectory) onDirectory(); else { setSelected(null); setVersion((value) => value + 1) } }}>{group === 'individuals' ? 'Volver a particulares' : 'Volver a organizaciones'}</button><span className="badge">{roles[selected.role]}</span>{selected.role === 'owner' && !selected.deleted_at && <button className="danger" aria-label={`Eliminar ${selected.kind === 'individual' ? 'particular' : 'organización'} ${selected.name}`} disabled={busy} onClick={() => void removeOrganization(selected)}>Eliminar</button>}</div>
      <label className="mb-5 block max-w-md text-sm font-medium">{group === 'individuals' ? 'Particular activo' : 'Organización activa'}<select aria-label={group === 'individuals' ? 'Particular activo' : 'Organización activa'} className="mt-2" value={selected.id} onChange={(event) => { if (onOpenOrganization) onOpenOrganization(event.target.value); else setSelected(organizations.find((org) => org.id === event.target.value) || null) }}>{(group === 'all' ? organizations.filter((org) => !org.deleted_at || org.id === selected.id) : visibleOrganizations).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      {selected.deleted_at && <p className="my-4 text-sm text-muted">Esta organización fue eliminada de las listas activas. Sus recorridos e historial se conservan.</p>}
      <h3 className="text-2xl">{selected.name}</h3><p className="muted mt-2">Límite de {selected.tour_limit} recorridos · hasta {selected.member_limit} colaboradores · {(selected.storage_quota_bytes / 1024**3).toFixed(1)} GiB de cuota</p>
      {tab === 'tours' && <ToursPanel onCreateWork={writable && !selected.deleted_at && onNewWork ? () => onNewWork(selected.id) : undefined} initialTourId={initialTourId} onOpenTour={onTourChange} onBackToCollection={initialTourId && onTourChange ? () => onTourChange('') : undefined} key={`${selected.id}-${version}-${initialTourId || ''}`} organization={selected} onExpired={onExpired} />}
      {tab === 'properties' && <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]"><div className="space-y-3">{!properties.length && <p className="card p-6 text-sm text-muted">Aún no hay propiedades. Registrá el espacio y después creá su recorrido.</p>}{properties.map((property) => <article key={property.id} className="card p-5"><h4>{property.title}</h4><p className="muted mt-2">{property.kind} · {property.locality}{property.area_m2 ? ` · ${property.area_m2} m²` : ''}</p>{property.address && <p className="muted">{property.address}</p>}<p className="my-3 text-xs text-muted">{tours.filter((tour) => tour.property_id === property.id).length} recorridos asociados</p>
        {writable && <button className="mb-3 mr-2" onClick={() => { setPropertyDraft(property); requestAnimationFrame(() => document.getElementById('property-form')?.scrollIntoView({ block: 'center' })) }}>Editar propiedad {property.title}</button>}
        {tours.some((tour) => tour.property_id === property.id) ? <button onClick={() => { setTab('tours'); onSectionChange?.('tours') }}>Ver recorridos</button> : writable && <button disabled={busy} onClick={() => void act(async () => {
          const slug = `propiedad-${property.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`
          await businessApi.createTour(selected.id, { title: property.title, slug, description: '', property_id: property.id }); setTab('tours'); onSectionChange?.('tours')
        })}>Crear recorrido para {property.title}</button>}
      </article>)}</div>{writable && (!selected.deleted_at || propertyDraft) && <form id="property-form" key={propertyDraft?.id || 'new-property'} className="card p-5" aria-label="Nueva propiedad" onChange={() => setDirty(true)} onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
        void act(async () => { const dataToSave = { title: String(data.get('title')), kind: String(data.get('kind')) as Property['kind'], locality: String(data.get('locality')), address: String(data.get('address')), client_id: data.get('client') ? String(data.get('client')) : null, area_m2: data.get('area') ? Number(data.get('area')) : null, rooms: data.get('rooms') ? Number(data.get('rooms')) : null, notes: propertyDraft?.notes || '' }; if (propertyDraft) await businessApi.updateProperty(selected.id, propertyDraft.id, dataToSave); else await businessApi.createProperty(selected.id, dataToSave); setPropertyDraft(null); form.reset(); setDirty(false) })
      }}><h3 className="mb-5">{propertyDraft ? 'Editar propiedad' : 'Nueva propiedad'}</h3><fieldset disabled={busy}><label>Nombre de la propiedad<input name="title" defaultValue={propertyDraft?.title} required maxLength={200} /></label><label>Tipo de propiedad<select name="kind" defaultValue={propertyDraft?.kind || 'casa'}><option value="casa">Casa</option><option value="departamento">Departamento</option><option value="local">Local</option><option value="oficina">Oficina</option><option value="hotel">Hotel</option><option value="otro">Otro</option></select></label><label>Localidad<input name="locality" defaultValue={propertyDraft?.locality} required maxLength={160} /></label><label>Dirección interna<input name="address" defaultValue={propertyDraft?.address} maxLength={300} /></label><label>Superficie (m²)<input name="area" defaultValue={propertyDraft?.area_m2 ?? ''} type="number" min={1} max={10000000} step="any" /></label><label>Ambientes<input name="rooms" defaultValue={propertyDraft?.rooms ?? ''} type="number" min={1} max={10000} /></label><label>Contacto asociado<select name="client" defaultValue={propertyDraft?.client_id || ''}><option value="">Sin contacto asociado</option>{clients.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><p className="field-hint">La dirección y los datos del cliente son internos; no se publican en el recorrido.</p><button className="btn-primary w-full">Guardar propiedad</button>{propertyDraft && <button type="button" className="mt-2 w-full" onClick={() => { setPropertyDraft(null); setDirty(false) }}>Cancelar edición de propiedad</button>}</fieldset></form>}</div>}
      {tab === 'members' && !manageable && <p role="status" className="card p-5">Sólo propietarios y administradores pueden gestionar el equipo de esta organización. Tu rol es {roles[selected.role].toLowerCase()}.</p>}
      {tab === 'members' && manageable && <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]"><ul className="space-y-3">{members.map((member) => <li key={member.user_id} className="card flex flex-wrap items-center gap-3 p-4"><div className="mr-auto"><p className="break-all text-sm">{member.email}</p><p className="muted">{roles[member.role]}</p></div><button disabled={busy || (member.role === 'owner' && selected.role !== 'owner')} onClick={() => {
        if (window.confirm(`¿Quitar el acceso de ${member.email}?`)) void act(() => businessApi.removeMember(selected.id, member.user_id))
      }}>Quitar acceso</button></li>)}</ul><form className="card p-5" aria-label="Gestionar colaborador" onChange={() => setDirty(true)} onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
        void act(async () => { await businessApi.setMember(selected.id, { email: String(data.get('email')), role: String(data.get('role')) as components['schemas']['MemberInput']['role'] }); form.reset(); setDirty(false) })
      }}><h3 className="mb-4">Agregar o actualizar acceso</h3><p className="muted mb-5">La persona debe tener una cuenta. Esto otorga acceso directamente; no envía una invitación por email.</p><fieldset disabled={busy}><label>Email de la cuenta<input name="email" type="email" required maxLength={254} /></label><label>Rol<select name="role" defaultValue="editor"><option value="editor">Editor / fotógrafo</option><option value="viewer">Sólo lectura</option><option value="admin">Administrador</option>{selected.role === 'owner' && <option value="owner">Propietario</option>}</select></label><button className="btn-primary">Guardar acceso</button></fieldset></form></div>}
    </>}
  </section>
}
