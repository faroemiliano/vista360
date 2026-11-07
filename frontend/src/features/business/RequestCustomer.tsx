import { useEffect, useRef, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization, ServiceJob } from '../../api/business'
import { useNavigationDirty } from '../../app/navigation'

export function RequestCustomer({ workspaceId, source, organizations, onSelected }: {
  workspaceId: string; source: ServiceJob; organizations: Organization[]; onSelected: (client: Organization) => void
}) {
  const [choice, setChoice] = useState<'new' | 'existing' | null>(null)
  const [kind, setKind] = useState<'individual' | 'company'>('individual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useNavigationDirty()
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const available = organizations.filter((org) => !org.deleted_at && org.role !== 'viewer')
  return <section className="card my-6 max-w-3xl p-5 sm:p-7" aria-label="Cliente de la consulta">
    <p className="eyebrow mb-3">De la consulta al trabajo</p><h3 className="text-2xl">¿Es un cliente nuevo?</h3>
    <p className="muted my-4">La consulta es de {source.name}. Podés registrar a esta persona o empresa acá mismo, o elegir un cliente que ya tengas.</p>
    <div className="row-actions"><button className={choice === 'new' ? 'btn-primary' : ''} aria-pressed={choice === 'new'} disabled={busy} onClick={() => { setChoice('new'); setError('') }}>Nuevo cliente</button>
      <button aria-pressed={choice === 'existing'} disabled={busy} onClick={() => { if (choice === 'new' && dirty && !window.confirm('¿Descartar los datos del cliente sin guardar?')) return; setDirty(false); setChoice('existing'); setError('') }}>Cliente existente</button></div>
    {error && <p role="alert">{error}</p>}
    {choice === 'existing' && <div className="mt-5"><label className="block text-sm">Cliente del trabajo<select className="mt-2" defaultValue="" onChange={(event) => {
      const client = available.find((row) => row.id === event.target.value)
      if (client) { setDirty(false); onSelected(client) }
    }}><option value="" disabled>Elegí un cliente</option>{available.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      {!available.length && <p className="muted mt-3">Todavía no tenés clientes disponibles. Usá Nuevo cliente para registrar al que hizo esta consulta.</p>}</div>}
    {choice === 'new' && <form className="mt-5" aria-label="Registrar cliente desde consulta" onChange={() => setDirty(true)} onSubmit={async (event) => {
      event.preventDefault()
      if (busy) return
      const data = new FormData(event.currentTarget)
      setBusy(true); setError(''); setDirty(true)
      try {
        const client = await businessApi.createOrganization({ workspace_id: workspaceId, kind, name: String(data.get('name')).trim(),
          email: String(data.get('email')).trim() || null, phone: String(data.get('phone')).trim() || null,
          locality: String(data.get('locality')).trim() || null,
          legal_name: kind === 'company' ? String(data.get('legal_name') || '').trim() || null : null,
          contact_name: kind === 'company' ? String(data.get('contact_name') || '').trim() || null : null })
        if (active.current) { setDirty(false); onSelected(client) }
      } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'No se pudo registrar el cliente. La consulta sigue guardada.') }
      finally { if (active.current) setBusy(false) }
    }}>
      <fieldset disabled={busy} className="grid gap-x-5 sm:grid-cols-2">
        <label>Tipo de cliente<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="individual">Particular</option><option value="company">Empresa / organización</option></select></label>
        <label>{kind === 'individual' ? 'Nombre del particular' : 'Nombre de la empresa'}<input name="name" required maxLength={160} defaultValue={source.name} /></label>
        <label>Email del cliente<input name="email" type="email" maxLength={254} defaultValue={source.email} /></label>
        <label>Teléfono del cliente<input name="phone" type="tel" maxLength={50} defaultValue={source.whatsapp} /></label>
        <label>Localidad del cliente<input name="locality" maxLength={160} defaultValue={source.locality} /></label>
        {kind === 'company' && <><label>Razón social<input name="legal_name" maxLength={200} /></label><label>Responsable<input name="contact_name" maxLength={160} defaultValue={source.name} /></label></>}
        <p className="field-hint sm:col-span-2">Los datos vienen de la consulta. Revisalos y guardá: el cliente quedará en tu agenda y seguís preparando el trabajo.</p>
        <div className="row-actions sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Registrando cliente…' : 'Guardar cliente y continuar'}</button></div>
      </fieldset>
    </form>}
  </section>
}
