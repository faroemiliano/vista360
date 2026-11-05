import { useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization } from '../../api/business'
import type { components } from '../../api/schema'
import { useBlockNavigation } from '../../app/navigation'

export function clientDetails(data: FormData): components['schemas']['OrganizationDetails'] {
  const optional = (field: string) => String(data.get(field) || '').trim() || null
  return { name: String(data.get('name')).trim(), legal_name: optional('legal_name'), email: optional('email'),
    phone: optional('phone'), locality: optional('locality'), contact_name: optional('contact_name'),
    address: optional('address'), notes: optional('notes') }
}

export function ClientFields({ individual, client }: { individual: boolean; client?: Organization }) {
  return <>
    <label>{individual ? 'Nombre del particular' : 'Nombre de la organización'}<input name="name" required maxLength={160} defaultValue={client?.name || ''} autoComplete="name" /></label>
    {!individual && <label>Razón social<input name="legal_name" maxLength={200} defaultValue={client?.legal_name || ''} /></label>}
    <label>Email<input name="email" type="email" maxLength={254} defaultValue={client?.email || ''} autoComplete="email" /></label>
    <label>Teléfono<input name="phone" type="tel" maxLength={50} defaultValue={client?.phone || ''} autoComplete="tel" /></label>
    <label>Localidad<input name="locality" maxLength={160} defaultValue={client?.locality || ''} autoComplete="address-level2" /></label>
    {!individual && <label>Responsable<input name="contact_name" maxLength={160} defaultValue={client?.contact_name || ''} /></label>}
    <label>Dirección<input name="address" maxLength={300} defaultValue={client?.address || ''} autoComplete="street-address" /></label>
    <label>Notas internas<textarea name="notes" maxLength={2000} defaultValue={client?.notes || ''} /></label>
    <p className="field-hint">Sólo el nombre es obligatorio. Estos datos son internos y no aparecen en el recorrido público.</p>
  </>
}

export function ClientProfile({ client, onSaved, onClose }: {
  client: Organization; onSaved: (client: Organization) => void; onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useBlockNavigation(dirty)
  const individual = client.kind === 'individual'
  const canEdit = !client.deleted_at && ['owner', 'admin'].includes(client.role)
  function discard() { return !dirty || window.confirm('¿Descartar los cambios de la ficha sin guardar?') }
  const fields = [
    ...(!individual ? [['Razón social', client.legal_name], ['Responsable', client.contact_name]] : []),
    ['Email', client.email], ['Teléfono', client.phone], ['Localidad', client.locality],
    ['Dirección', client.address], ['Notas internas', client.notes],
  ]
  return <section className="card max-w-3xl p-5 sm:p-6" aria-label="Ficha del cliente">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow mb-2">{individual ? 'Particular' : 'Organización'} · Ficha interna</p><h2 className="break-words">{client.name}</h2></div>
      <button disabled={busy} onClick={() => { if (discard()) onClose() }}>Volver a la lista</button></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status" className="mb-4 text-accent">{notice}</p>}
    {editing ? <form aria-label="Editar ficha del cliente" onChange={() => setDirty(true)} onSubmit={async (event) => {
      event.preventDefault(); if (busy) return
      const details = clientDetails(new FormData(event.currentTarget))
      setBusy(true); setError(''); setNotice('')
      try {
        const saved = await businessApi.updateOrganization(client.id, details)
        onSaved(saved); setEditing(false); setDirty(false); setNotice('Datos del cliente guardados.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la ficha.') }
      finally { setBusy(false) }
    }}><fieldset disabled={busy}><div className="grid gap-x-5 sm:grid-cols-2"><ClientFields individual={individual} client={client} /></div>
      <div className="row-actions"><button className="btn-primary" type="submit">Guardar cambios</button><button type="button" onClick={() => { if (discard()) { setEditing(false); setDirty(false); setError('') } }}>Cancelar edición</button></div>
    </fieldset></form> : <>
      <dl className="grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || 'Sin completar'}</dd></div>)}</dl>
      {canEdit && <button className="btn-primary mt-6" onClick={() => { setEditing(true); setNotice('') }}>Editar información</button>}
    </>}
  </section>
}
