import { useId, useState } from 'react'
import { businessApi } from '../../api/business'
import type { WorkJob } from '../../api/business'
import { useBlockNavigation } from '../../app/navigation'
import { dateLocale, getLanguage, t } from '../../i18n'

export function DeliveryDocumentForm({ job, writable, blocked, onChanged }: {
  job: WorkJob; writable: boolean; blocked: boolean; onChanged: (job: WorkJob) => void
}) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const conditionsId = useId()
  useBlockNavigation(dirty)
  const saved = job.delivery_document
  const file = job.delivery_file
  async function generate() {
    if (busy || blocked || dirty || !saved || !job.public_path) return
    if (file && !window.confirm(t('¿Generar un nuevo PDF y reemplazar el archivo guardado? Las copias ya descargadas no cambian.'))) return
    setBusy(true); setError(''); setMessage('')
    try {
      const updated = await businessApi.generateDeliveryFile(job.organization_id!, job.id, {
        expected_revision: job.work_revision, expected_file_id: file?.id || null,
        language: getLanguage(), timezone_offset_minutes: new Date().getTimezoneOffset(),
      })
      onChanged(updated)
      setMessage(t('PDF generado y guardado en este trabajo. Ya podés verlo o descargarlo.'))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('No se pudo guardar el PDF. El archivo anterior se conserva')) }
    finally { setBusy(false) }
  }
  return <section className="mt-6 rounded-xl border border-line p-4 sm:p-5" aria-label={t('PDF de entrega')}>
    <h4 className="font-semibold">{t('PDF de entrega')}</h4>
    {file ? <article className="my-4 rounded-xl border border-accent/25 bg-accent/5 p-4" aria-label={t('Archivo PDF guardado')}>
      <p className="break-words text-sm font-semibold">{file.filename}</p>
      <p className="mt-2 text-xs text-muted">{t('Generado el')} {new Date(file.created_at).toLocaleString(dateLocale())} · {(file.size_bytes / 1024).toFixed(1)} KiB</p>
      <div className="row-actions !mb-0">
        <a className="nav-action btn-primary" href={businessApi.deliveryFileUrl(job.organization_id!, job.id, file.id)} target="_blank" rel="noopener noreferrer">{t('Ver PDF')}</a>
        <a className="nav-action" href={businessApi.deliveryFileUrl(job.organization_id!, job.id, file.id, true)}>{t('Descargar PDF')}</a>
      </div>
      <p className="mt-3 text-xs text-muted">{t('Este es el archivo guardado. Podés descargar la misma copia cuando la necesites.')}</p>
    </article> : <p className="my-4 text-sm text-muted">{t('Todavía no hay un archivo PDF guardado. Prepará los datos y generá el documento para conservarlo en este trabajo.')}</p>}
    <details key={file?.id || 'prepare'} open={!file} className="mt-4" aria-label={t('Datos del documento')}>
      <summary>{file ? writable ? t('Editar documento') : t('Datos del documento') : t('Preparar PDF de entrega')}</summary>
      <p className="my-4 text-sm text-muted">{t('El PDF incluye el enlace, QR, ubicación y condiciones para tu cliente. Se guarda como archivo dentro de este trabajo.')}</p>
      <form key={JSON.stringify(saved)} aria-label={t('Datos del PDF de entrega')} onChange={() => { setDirty(true); setMessage('') }} onSubmit={async event => {
        event.preventDefault()
        if (busy || blocked) return
        const data = new FormData(event.currentTarget)
        setBusy(true); setError(''); setMessage('')
        try {
          const result = await businessApi.saveDeliveryDocument(job.organization_id!, job.id, {
            expected_revision: job.work_revision, studio_name: String(data.get('studio_name')),
            contact: String(data.get('contact')), conditions: String(data.get('conditions')),
          })
          setDirty(false); onChanged(result); setMessage(t('Datos guardados. Generá el PDF para incluirlos en el archivo.'))
        } catch (cause) { setError(cause instanceof Error ? cause.message : t('No se pudo guardar el documento.')) }
        finally { setBusy(false) }
      }}>
        <fieldset className="min-w-0" disabled={!writable || busy || blocked}>
          <label>{t('Estudio o fotógrafo responsable')}<input name="studio_name" required maxLength={160} defaultValue={saved?.studio_name || ''} autoComplete="organization" /></label>
          <label>{t('Contacto para el cliente')}<input name="contact" required maxLength={300} defaultValue={saved?.contact || ''} placeholder={t('Email, teléfono o WhatsApp del estudio')} /></label>
          <div className="mb-4"><label htmlFor={conditionsId} className="!mb-2">{t('Condiciones de entrega')}</label><textarea id={conditionsId} name="conditions" required maxLength={5000} rows={6} defaultValue={saved?.conditions || ''} placeholder={t('Indicá el alojamiento acordado, los ajustes incluidos y cómo solicitar una renovación.')} /></div>
          <p className="field-hint">{t('Este texto acompaña la entrega. No programa vencimientos, suspensiones ni cobros automáticos.')}</p>
          {writable && <button type="submit" disabled={busy || blocked}>{busy ? t('Guardando…') : t('Guardar datos del PDF')}</button>}
        </fieldset>
      </form>
      {file && <p className="field-hint">{t('Editar los datos no cambia el PDF guardado. Generá uno nuevo cuando quieras reemplazarlo.')}</p>}
    </details>
    {writable && <button className="btn-primary mt-4" disabled={!saved || dirty || busy || blocked || !job.public_path} onClick={() => void generate()}>{busy ? t('Guardando…') : file ? t('Generar nuevo PDF') : t('Generar y guardar PDF')}</button>}
    {dirty && <p className="field-hint">{t('Guardá los datos antes de generar el PDF.')}</p>}
    {!job.public_path && <p className="field-hint">{t('El recorrido no está publicado. El archivo guardado se conserva; para generar otro, publicá el recorrido.')}</p>}
    {job.has_unpublished_changes && <p className="field-hint">{t('El documento enlaza la versión pública actual. Publicá los cambios del recorrido para actualizarla.')}</p>}
    {message && <p role="status" className="mt-3 text-sm text-accent">{t(message)}</p>}
    {error && <p role="alert" className="mt-3 text-sm">{t(error)}</p>}
  </section>
}
