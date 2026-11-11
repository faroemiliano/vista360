import { t } from '../../i18n'
import { useRef, useState } from 'react'
import { useNavigationDirty } from '../../app/navigation'
import { businessApi } from '../../api/business'
import type { Organization, ServiceJob, WorkJob } from '../../api/business'
import type { components } from '../../api/schema'

export function WorkForm({ organization, source, onSaved, onCancel }: {
  organization: Organization; source?: ServiceJob; onSaved: (job: WorkJob) => void; onCancel: () => void
}) {
  const [, setDirty] = useNavigationDirty()
  const submissionId = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const contact = organization.kind === 'individual' ? organization.name : organization.contact_name || organization.name
  return <form aria-label={t("Preparar trabajo")} className="card my-6 p-5 sm:p-7" onChange={() => setDirty(true)} onSubmit={async (event) => {
    event.preventDefault(); if (busy) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const title = String(data.get('title'))
      const job = source ? await businessApi.assignWork(source.id, { title, organization_id: organization.id }, source.workspace_id || undefined)
        : await businessApi.createWork(organization.id, { title, submission_id: submissionId.current, use_customer_profile: true, consent: true, website: '',
          property_kind: String(data.get('kind')) as components['schemas']['WorkCreate']['property_kind'],
          locality: String(data.get('locality')), area_m2: Number(data.get('area')), rooms: Number(data.get('rooms')), message: String(data.get('message')) })
      setDirty(false); onSaved(job)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo preparar el trabajo.")) }
    finally { setBusy(false) }
  }}>
    <p className="eyebrow mb-2">{source ? t("De la consulta a la producción") : t("Servicio de digitalización")}</p>
    <h3 className="text-2xl">{source ? t("Preparar trabajo desde solicitud") : t("Nuevo trabajo")}</h3>
    <p className="muted my-4">{t("Cliente:")} <strong>{organization.name}</strong>. {t("Completá los datos del inmueble para preparar su recorrido.")}</p>
    {error && <p role="alert">{t(error)}</p>}
    <fieldset disabled={busy} className="grid min-w-0 gap-x-5 sm:grid-cols-2">
      <label className="sm:col-span-2">{t("Nombre del trabajo")}<input name="title" required maxLength={200} defaultValue={source ? `Recorrido en ${source.locality}` : ''} /></label>
      {!source ? <>
        <div className="mb-5 rounded-xl border border-line p-4 sm:col-span-2" aria-label={t("Contacto de la ficha")}>
          <p className="eyebrow mb-3">{t("Contacto de la ficha")}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {[[t("Nombre"), contact], [t("Email"), organization.email], [t("Teléfono"), organization.phone]].map(([label, value]) =>
              <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words">{value || t("Sin completar")}</dd></div>)}
          </dl>
          <p className="field-hint mt-3 mb-0">{t("Usamos los datos guardados del cliente. Para actualizarlos, editá su ficha en Particulares u Organizaciones. No es necesario completar email o teléfono para crear el trabajo.")}</p>
        </div>
        <label>{t("Tipo de espacio")}<select name="kind" defaultValue="casa">{['casa', 'departamento', 'local', 'oficina', 'hotel', 'otro'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
        <label>{t("Localidad del trabajo")}<input name="locality" required minLength={2} maxLength={160} defaultValue={organization.locality || ''} /></label>
        <label>{t("Superficie aproximada (m²)")}<input name="area" type="number" required min={1} max={10000000} step="any" /></label>
        <label>{t("Cantidad de ambientes")}<input name="rooms" type="number" required min={1} max={10000} /></label>
        <label className="sm:col-span-2">{t("Detalle del pedido")}<textarea name="message" maxLength={5000} /></label>
      </> : <p className="muted sm:col-span-2">{t("Contacto de la solicitud:")} {source.name} · {source.email}{t(". Los registros existentes conservarán sus datos.")}</p>}
      <div className="row-actions sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? t("Preparando…") : t("Guardar y abrir trabajo")}</button><button type="button" onClick={onCancel} disabled={busy}>{t("Cancelar")}</button></div>
    </fieldset>
  </form>
}
