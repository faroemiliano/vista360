import { useEffect, useRef, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization, ServiceJob, WorkJob } from '../../api/business'
import { ToursPanel } from '../tours/ToursPanel'
import { StudioPanel } from './StudioPanel'
import { WorkDetail } from './WorkDetail'
import { WorkForm } from './WorkForm'
import { WorkSteps } from '../../components/WorkSteps'
import type { WorkStep, TourStep } from '../../components/WorkSteps'
import { statusName, statuses } from './workflow'
import { useNavigationDirty } from '../../app/navigation'
import type { StudioRoute } from '../../app/navigation'

export function JobsPanel({ workspaceId, onExpired, onNavigate, initialOrganizationId, onOrganizationChange, mode = 'work', requestWorkspaceId, initialRequestId, initialWorkJob, onOpenWork, initialCreate = false, initialJobId, initialStep, initialFilter = '', initialOffset = 0, onRouteChange }: {
  initialJobId?: string; initialStep?: WorkStep; initialFilter?: string; initialOffset?: number;
  onRouteChange?: (changes: Partial<StudioRoute>, replace?: boolean) => boolean;
  workspaceId: string; initialCreate?: boolean;
  staff: boolean; onExpired: () => void; onNavigate: (org: string, tab: string) => void;
  initialOrganizationId?: string; onOrganizationChange?: (id: string) => void; mode?: 'work' | 'requests';
  requestWorkspaceId?: string; initialRequestId?: string; initialWorkJob?: WorkJob | null; onOpenWork?: (job: WorkJob) => void
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgId, setOrgId] = useState('')
  const [jobs, setJobs] = useState<WorkJob[]>([])
  const [selected, setSelected] = useState<WorkJob | null>(initialWorkJob || null)
  const [creating, setCreating] = useState(initialCreate)
  const [source, setSource] = useState<ServiceJob | undefined>()
  const [step, setStep] = useState<WorkStep>(initialStep || (initialWorkJob?.public_path ? 'delivery' : 'visit'))
  const [unsaved, setUnsaved] = useNavigationDirty()
  const transition = useRef(0)
  const [filter, setFilter] = useState(initialFilter)
  const [offset, setOffset] = useState(initialOffset)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadingJob, setLoadingJob] = useState(Boolean(initialJobId))
  const organization = organizations.find((org) => org.id === orgId)
  useEffect(() => {
    let active = true
    businessApi.organizations(true, workspaceId).then((rows) => {
      if (!active) return
      setOrganizations(rows)
      const id = initialOrganizationId ? rows.find((org) => org.id === initialOrganizationId)?.id || '' : rows.find((org) => !org.deleted_at)?.id || rows[0]?.id || ''
      setOrgId(id)
      if (initialOrganizationId && !id) setError('Cliente no encontrado en este estudio.')
      if (!initialOrganizationId && id) onRouteChange?.({ organizationId: id }, true)
    })
      .catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!organizations.length || !initialOrganizationId) return
    const found = organizations.some((org) => org.id === initialOrganizationId)
    setOrgId(found ? initialOrganizationId : '')
    if (!found) setError('Cliente no encontrado en este estudio.')
  }, [initialOrganizationId, organizations])
  useEffect(() => { setCreating(initialCreate) }, [initialCreate])
  useEffect(() => { if (initialStep) { setUnsaved(false); setStep(initialStep) } }, [initialStep, setUnsaved])
  useEffect(() => { setFilter(initialFilter); setOffset(initialOffset) }, [initialFilter, initialOffset])
  useEffect(() => {
    setUnsaved(false)
    if (!initialJobId) { setSelected(null); setLoadingJob(false); return }
    if (!orgId) return
    let active = true
    setLoadingJob(true); setSelected((current) => current?.id === initialJobId ? current : null); setError('')
    businessApi.work(orgId, initialJobId).then((job) => { if (active) setSelected(job) })
      .catch((cause: Error) => { if (active) setError(cause.message) })
      .finally(() => { if (active) setLoadingJob(false) })
    return () => { active = false }
  }, [initialJobId, orgId, setUnsaved])
  useEffect(() => { if (orgId) onOrganizationChange?.(orgId) }, [orgId, onOrganizationChange])
  useEffect(() => {
    if (!orgId) return
    let active = true; setLoading(true); setJobs([])
    businessApi.workList(orgId, offset, filter).then((rows) => { if (active) setJobs(rows) })
      .catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [orgId, version, filter, offset])
  async function open(job: WorkJob) {
    setError('')
    try { const fresh = await businessApi.work(orgId, job.id); const next = fresh.public_path ? 'delivery' : fresh.scheduled_at ? 'photos' : 'visit'; if (onRouteChange?.({ jobId: fresh.id, organizationId: orgId, step: next, creating: false }) === false) return; setSelected(fresh); setStep(next) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el trabajo.') }
  }
  async function go(next: WorkStep) {
    if (next === step) return
    if (onRouteChange) {
      if (onRouteChange({ step: next })) { setUnsaved(false); setStep(next) }
      return
    }
    if (!onRouteChange && unsaved && !window.confirm('¿Descartar los cambios sin guardar?')) return
    const request = ++transition.current
    setError('')
    try {
      const fresh = selected ? await businessApi.work(orgId, selected.id) : null
      if (request !== transition.current) return
      if (fresh) setSelected(fresh)
      setUnsaved(false); setStep(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el trabajo.') }
  }
  if (initialJobId && selected?.id !== initialJobId) return <section>{error ? <p role="alert">{error}</p> : <p role="status">{loadingJob ? 'Abriendo trabajo…' : 'No se pudo abrir el trabajo.'}</p>}<button onClick={() => onRouteChange?.({ jobId: '', creating: false })}>Volver a trabajos</button></section>
  if (selected && organization && (!onRouteChange || initialJobId)) return <section>
    {error && <p role="alert">{error}</p>}
    <button className="btn-quiet" onClick={() => {
      if (!onRouteChange && unsaved && !window.confirm('¿Descartar los cambios sin guardar?')) return
      if (onRouteChange?.({ jobId: '', creating: false }) === false) return
      setSelected(null); setUnsaved(false); setVersion((value) => value + 1)
    }}>Volver a trabajos</button>
    <div className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow mb-2">{organization.name} · {selected.locality}</p><h2 className="break-words text-3xl">{selected.title}</h2></div><div className="flex flex-wrap gap-3 text-xs"><div><p className="mb-2 text-muted">Trabajo</p><span className="badge">{statusName(selected.status)}</span></div><div><p className="mb-2 text-muted">Recorrido</p><span className="badge">{selected.public_path ? selected.has_unpublished_changes ? 'Publicado · cambios pendientes' : 'Publicado' : 'Borrador'}</span></div></div></div>
    {organization.deleted_at && <p className="my-4 rounded-xl border border-line p-4 text-sm text-muted">Organización eliminada: {organization.name}. Este trabajo, su historial y su recorrido se conservan con los mismos permisos.</p>}
    {selected.client_deleted && <p className="my-3 text-sm text-muted">Contacto eliminado de la agenda. Se conserva su referencia en este trabajo.</p>}
    <WorkSteps current={step} onChange={(next) => void go(next)} />
    {(['photos', 'connections', 'review'] as WorkStep[]).includes(step) && selected.tour_id ? <>
      <ToursPanel key={selected.tour_id} organization={organization} initialTourId={selected.tour_id} onExpired={onExpired}
        onPublicationChange={async () => setSelected(await businessApi.work(orgId, selected.id))} guidedStep={step as TourStep} onStepChange={(next) => void go(next)} onDirtyChange={setUnsaved} />
    </> : <WorkDetail hasUnsavedChanges={unsaved} onDirtyChange={setUnsaved} job={selected} organization={organization} step={step} onStepChange={(next) => void go(next)} onChanged={setSelected} onEditor={() => void go('photos')} onNavigate={onNavigate} />}
  </section>
  return <section>
    <p className="eyebrow mb-3">Tu servicio, de principio a fin</p><h2 className="text-3xl">{mode === 'requests' ? 'Solicitudes de digitalización' : 'Trabajos'}</h2><p className="muted mt-3">{mode === 'requests' ? 'Revisá las consultas recibidas y prepará sus trabajos en tu organización.' : 'Organizá la visita, prepará el recorrido y entregá el enlace a la inmobiliaria.'}</p>
    {error && <p role="alert">{error}</p>}
    <div className="my-5 max-w-lg"><label>Cliente del trabajo<select value={orgId} disabled={creating} onChange={(event) => { if (onRouteChange?.({ organizationId: event.target.value, offset: 0, jobId: '' }) === false) return; setOrgId(event.target.value); setOffset(0); setError('') }}><option value="" disabled>Elegí un cliente</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}{org.deleted_at ? ' — eliminada' : ''}</option>)}</select></label></div>
    {organization?.deleted_at && <div className="my-5 rounded-xl border border-line p-4"><p className="text-sm text-muted">{organization.name} fue eliminada. Sus trabajos y recorridos siguen disponibles; para un trabajo nuevo elegí una organización activa.</p><button className="mt-3" onClick={() => onNavigate(organization.id, 'tours')}>Ver recorridos conservados</button></div>}
    {!organization && !loading && <div className="card p-6"><h3>Registrá tu primer cliente</h3><p className="muted my-4">Tu estudio ya está creado. Agregá la inmobiliaria o empresa que te contrata en Organizaciones, o una persona en Particulares. Después prepará su trabajo y entregale el enlace sin que necesite una cuenta.</p><button onClick={() => onNavigate('', 'tours')}>Crear organización cliente</button></div>}
    {creating && organization && !organization.deleted_at && <WorkForm customerName={initialCreate ? organization.name : undefined} key={`${organization.id}-${source?.id || 'new'}`} organization={organization} source={source} onCancel={() => { if (onRouteChange) { onRouteChange({ creating: false }); return }; setCreating(false); setSource(undefined) }} onSaved={(job) => { setCreating(false); setSource(undefined); if (mode === 'requests' && onOpenWork) onOpenWork(job); else { setSelected(job); setStep('visit'); onRouteChange?.({ jobId: job.id, organizationId: orgId, step: 'visit', creating: false }, true) }; setVersion((value) => value + 1) }} />}
    {!creating && (mode === 'requests' ? <StudioPanel embedded workspaceId={requestWorkspaceId} requestId={initialRequestId} onShowAll={() => onRouteChange?.({ requestId: '' })} onPrepare={(job) => {
      if (!organization || organization.deleted_at || organization.role === 'viewer') { setError('Elegí una organización activa donde tengas permiso para editar.'); return }
      setSource(job); setCreating(true); window.scrollTo({ top: 0, behavior: 'smooth' })
    }} /> : <>
      {organization && <div className="my-6 flex flex-wrap items-end justify-between gap-4"><label className="!mb-0">Filtrar trabajos<select value={filter} onChange={(event) => { if (onRouteChange?.({ status: event.target.value, offset: 0 }) === false) return; setFilter(event.target.value); setOffset(0) }}><option value="">Todos los estados</option>{statuses.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}</select></label>{!organization.deleted_at && organization.role !== 'viewer' && !creating && <button className="btn-primary" onClick={() => { if (onRouteChange?.({ creating: true, jobId: '' }) === false) return; setSource(undefined); setCreating(true) }}>Nuevo trabajo</button>}</div>}
      {loading && <p role="status">Consultando trabajos…</p>}
      {organization && !loading && !jobs.length && <div className="card p-6"><h3>No hay trabajos en esta vista</h3><p className="muted mt-3">{organization.deleted_at ? 'Los recorridos conservados se pueden abrir desde el botón anterior.' : 'Podés registrar un pedido recibido por teléfono o WhatsApp con Nuevo trabajo. Los recorridos anteriores siguen en sus secciones.'}</p></div>}
      {!creating && <div className="grid gap-4 md:grid-cols-2">{jobs.map((job) => <article key={job.id} className="card p-5"><span className="badge mb-4">{statusName(job.status)}</span><h3>{job.title}</h3><p className="muted mt-3">{job.client_name || job.name} · {job.locality}</p>{job.client_deleted && <p className="mt-2 text-xs text-muted">Contacto eliminado · referencia conservada</p>}<p className="mt-3 text-xs text-muted">{job.scheduled_at ? `Visita: ${new Date(job.scheduled_at).toLocaleString('es-AR')}` : 'Visita sin coordinar'}</p>{job.delivered_at && <p className="mt-2 text-xs text-accent">Entrega registrada</p>}<button className="mt-5 w-full" onClick={() => void open(job)}>Abrir trabajo {job.title}</button></article>)}</div>}
      {organization && <div className="row-actions"><button disabled={loading || offset === 0} onClick={() => { if (onRouteChange?.({ offset: Math.max(0, offset - 50) }) === false) return; setOffset(Math.max(0, offset - 50)) }}>Trabajos anteriores</button><span className="text-xs text-muted">{jobs.length} trabajos en esta página</span><button disabled={loading || jobs.length < 50} onClick={() => { if (onRouteChange?.({ offset: offset + 50 }) === false) return; setOffset(offset + 50) }}>Más trabajos</button><button disabled={loading} onClick={() => { setError(''); setVersion((value) => value + 1) }}>Actualizar trabajos</button></div>}
    </>)}
  </section>
}
