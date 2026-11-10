import { t } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { useNavigationDirty } from '../../app/navigation'
import { businessApi } from '../../api/business'
import type { Client, Organization, Property, ServiceJob, WorkJob } from '../../api/business'
import type { Tour } from '../../api/client'
import type { components } from '../../api/schema'

export function WorkForm({ organization, source, onSaved, onCancel, customerName }: {
  customerName?: string;
  organization: Organization; source?: ServiceJob; onSaved: (job: WorkJob) => void; onCancel: () => void
}) {
  const [, setDirty] = useNavigationDirty()
  const [clients, setClients] = useState<Client[]>([])
  const submissionId = useRef(crypto.randomUUID())
  const [properties, setProperties] = useState<Property[]>([])
  const [tours, setTours] = useState<Tour[]>([])
  const [clientId, setClientId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [tourId, setTourId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all([businessApi.clients(organization.id), businessApi.properties(organization.id), businessApi.tours(organization.id)])
      .then(([people, places, visits]) => { if (active) { setClients(people); setProperties(places); setTours(visits); const matching = customerName ? people.find((person) => person.name.trim().toLocaleLowerCase() === customerName.trim().toLocaleLowerCase()) : undefined; if (matching) setClientId(matching.id) } })
      .catch((cause: Error) => { if (active) setError(cause.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organization.id])
  return <form aria-label={t("Preparar trabajo")} className="card my-6 p-5 sm:p-7" onChange={() => setDirty(true)} onSubmit={async (event) => {
    event.preventDefault(); if (busy || loading) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const links = { title: String(data.get('title')), client_id: clientId || null, property_id: propertyId || null, tour_id: tourId || null }
      const job = source ? await businessApi.assignWork(source.id, { ...links, organization_id: organization.id }, source.workspace_id || undefined)
        : await businessApi.createWork(organization.id, { ...links, submission_id: submissionId.current, name: String(data.get('name')), email: String(data.get('email')),
          whatsapp: String(data.get('whatsapp')), property_kind: String(data.get('kind')) as components['schemas']['WorkCreate']['property_kind'],
          locality: String(data.get('locality')), area_m2: Number(data.get('area')), rooms: Number(data.get('rooms')), message: String(data.get('message')), consent: true, website: '' })
      setDirty(false); onSaved(job)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo preparar el trabajo.")) }
    finally { setBusy(false) }
  }}>
    <p className="eyebrow mb-2">{source ? t("De la consulta a la producción") : t("Servicio de digitalización")}</p>
    <h3 className="text-2xl">{source ? t("Preparar trabajo desde solicitud") : t("Nuevo trabajo")}</h3>
    <p className="muted my-4">{t("En")} {organization.name}{t(". Indicá el contacto y el inmueble para preparar su recorrido.")}</p>
    {error && <p role="alert">{t(error)}</p>}{loading && <p role="status">{t("Consultando tu cartera…")}</p>}
    <fieldset disabled={busy || loading} className="grid min-w-0 gap-x-5 sm:grid-cols-2">
      <label className="sm:col-span-2">{t("Nombre del trabajo")}<input name="title" required maxLength={200} defaultValue={source ? `Recorrido en ${source.locality}` : ''} /></label>
      <label>{t("Contacto guardado")}<select value={clientId} onChange={(event) => { setClientId(event.target.value); setPropertyId(''); setTourId('') }}><option value="">{t("Completar datos de contacto")}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <details className="mb-4 rounded-xl border border-line p-4 sm:col-span-2"><summary>{t("Usar una propiedad o recorrido existente")}</summary><div className="mt-4">      <label>{t("Propiedad existente")}<select value={propertyId} onChange={(event) => { const prop = properties.find((row) => row.id === event.target.value); setPropertyId(event.target.value); if (prop) setClientId(prop.client_id || ''); setTourId('') }}><option value="">{t("Crear propiedad con los datos del trabajo")}</option>{properties.filter((prop) => prop.client_id && clients.some((client) => client.id === prop.client_id) && (!clientId || prop.client_id === clientId)).map((prop) => <option key={prop.id} value={prop.id}>{prop.title}</option>)}</select></label>
      {propertyId && <label className="sm:col-span-2">{t("Recorrido existente")}<select value={tourId} onChange={(event) => setTourId(event.target.value)}><option value="">{t("Crear recorrido para esta propiedad")}</option>{tours.filter((tour) => tour.property_id === propertyId).map((tour) => <option key={tour.id} value={tour.id}>{tour.title}</option>)}</select></label>}
      <p className="field-hint sm:col-span-2">{t("Para reutilizar una propiedad debe tener un contacto asociado. Podés asociarlo desde Propiedades antes de preparar el trabajo.")}</p>
</div></details>
      {!source ? <>
        <p className="field-hint sm:col-span-2">{t("El cliente es")} {organization.name}{t(". Estos son los datos de contacto para este trabajo.")}</p>
        <label>{t("Nombre del contacto")}<input key={`name-${clientId}`} defaultValue={clients.find((client) => client.id === clientId)?.name || customerName || ''} name="name" required maxLength={160} minLength={2} /></label>
        <label>{t("Email de contacto")}<input key={`email-${clientId}`} defaultValue={clients.find((client) => client.id === clientId)?.email || ''} name="email" required type="email" maxLength={254} /></label>
        <label>{t("WhatsApp de contacto")}<input key={`phone-${clientId}`} defaultValue={clients.find((client) => client.id === clientId)?.phone || ''} name="whatsapp" required type="tel" maxLength={40} /></label>
        <label>{t("Tipo de espacio")}<select name="kind" defaultValue="casa">{['casa', 'departamento', 'local', 'oficina', 'hotel', 'otro'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label>{t("Localidad del trabajo")}<input name="locality" required minLength={2} maxLength={160} /></label>
        <label>{t("Superficie aproximada (m²)")}<input name="area" type="number" required min={1} max={10000000} step="any" /></label>
        <label>{t("Cantidad de ambientes")}<input name="rooms" type="number" required min={1} max={10000} /></label>
        <label className="sm:col-span-2">{t("Detalle del pedido")}<textarea name="message" maxLength={5000} /></label>
      </> : <p className="muted sm:col-span-2">{t("Contacto de la solicitud:")} {source.name} · {source.email}{t(". Los registros existentes conservarán sus datos.")}</p>}
      <div className="row-actions sm:col-span-2"><button className="btn-primary" disabled={busy || loading}>{busy ? t("Preparando…") : t("Guardar y abrir trabajo")}</button><button type="button" onClick={onCancel} disabled={busy}>{t("Cancelar")}</button></div>
    </fieldset>
  </form>
}
