import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { businessApi } from '../../api/business'
import type { WorkJob } from '../../api/business'
import { useBlockNavigation } from '../../app/navigation'
import { dateLocale, t } from '../../i18n'
import { directionsUrl } from '../../lib/maps'
import { deliveryDocumentFilename } from './deliveryDocumentName'
import './DeliveryDocument.css'

function DocumentIdentity({ job, clientName, studioName, issuedAt, paper = false }: {
  job: WorkJob; clientName: string; studioName: string; issuedAt?: string; paper?: boolean
}) {
  const date = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { dateStyle: 'long' })
  const fields = [
    [t('Cliente'), clientName], [t('Trabajo'), job.title], [t('Estudio o fotógrafo responsable'), studioName],
    [t('Referencia del trabajo'), job.id],
    ...(issuedAt ? [[t('Fecha de emisión'), date(issuedAt)], ...(job.delivered_at ? [[t('Fecha de entrega'), date(job.delivered_at)]] : [])] : []),
  ]
  return <dl aria-label={t('Identificación del documento')} className={paper ? 'delivery-document-identity' : 'my-4 grid gap-3 rounded-xl border border-line bg-surface-850 p-4 text-sm sm:grid-cols-2'}>
    {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className={paper ? '' : 'text-xs text-muted'}>{label}</dt><dd className={paper ? '' : 'mt-1 break-words'}>{value}</dd></div>)}
  </dl>
}

export function DeliveryDocumentForm({ job, clientName, studioName, writable, blocked, onChanged }: {
  job: WorkJob; clientName: string; studioName: string; writable: boolean; blocked: boolean; onChanged: (job: WorkJob) => void;
}) {
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(false)
  const conditionsId = useId()
  useBlockNavigation(dirty)
  const saved = job.delivery_document
  return <details className="mt-6 rounded-xl border border-line p-4 sm:p-5">
    <summary className="cursor-pointer font-semibold">{t('PDF de entrega')}</summary>
    <p className="my-4 text-sm text-muted">{t('Prepará un documento con el enlace, QR, ubicación y condiciones para tu cliente. Se guarda como PDF desde el navegador, sin servicios adicionales.')}</p>
    <DocumentIdentity job={job} clientName={clientName} studioName={saved?.studio_name || studioName} />
    <p className="mb-4 text-xs text-muted">{t('Los datos del documento quedan asociados a este trabajo. Podés volver a abrirlo y generar otra copia.')}</p>
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
        setDirty(false); onChanged(result); setMessage(t('Datos del documento guardados. Ya podés ver el PDF.'))
      } catch (cause) { setError(cause instanceof Error ? cause.message : t('No se pudo guardar el documento.')) }
      finally { setBusy(false) }
    }}>
      <fieldset className="min-w-0" disabled={!writable || busy || blocked}>
        <label>{t('Estudio o fotógrafo responsable')}<input name="studio_name" required maxLength={160} defaultValue={saved?.studio_name || studioName} autoComplete="organization" /></label>
        <label>{t('Contacto para el cliente')}<input name="contact" required maxLength={300} defaultValue={saved?.contact || ''} placeholder={t('Email, teléfono o WhatsApp del estudio')} /></label>
        <div className="mb-4"><label htmlFor={conditionsId} className="!mb-2">{t('Condiciones de entrega')}</label><textarea id={conditionsId} name="conditions" required maxLength={5000} rows={6} defaultValue={saved?.conditions || ''} placeholder={t('Indicá el alojamiento acordado, los ajustes incluidos y cómo solicitar una renovación.')} /></div>
        <p className="field-hint">{t('Este texto acompaña la entrega. No programa vencimientos, suspensiones ni cobros automáticos.')}</p>
        {writable && <button type="submit" disabled={busy || blocked}>{busy ? t('Guardando…') : t('Guardar datos del PDF')}</button>}
      </fieldset>
    </form>
    <p className="mt-4 text-xs text-muted">{job.delivery_location ? t('Google Maps se incluye con la ubicación de la versión publicada.') : t('No hay ubicación publicada. Podés agregarla en Revisar para incluir Google Maps.')}</p>
    <button className="btn-primary mt-4" disabled={!saved || dirty || busy || blocked} onClick={() => setPreview(true)}>{t('Ver PDF de entrega')}</button>
    {dirty && <p className="field-hint">{t('Guardá los datos antes de abrir el PDF.')}</p>}
    {job.has_unpublished_changes && <p className="field-hint">{t('El documento enlaza la versión pública actual. Publicá los cambios del recorrido para actualizarla.')}</p>}
    {message && <p role="status" className="mt-3 text-sm text-accent">{t(message)}</p>}
    {error && <p role="alert" className="mt-3 text-sm">{t(error)}</p>}
    {preview && saved && <DeliveryDocumentPreview job={job} clientName={clientName} onClose={() => setPreview(false)} />}
  </details>
}

export function DeliveryDocumentPreview({ job, clientName, onClose }: {
  job: WorkJob; clientName: string; onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [fontsReady, setFontsReady] = useState(false)
  const [issuedAt] = useState(() => new Date().toISOString())
  const filename = deliveryDocumentFilename(clientName, job.title, job.id, issuedAt)
  const link = job.public_path ? new URL(job.public_path, window.location.origin).href : ''
  const settings = job.delivery_document!
  useEffect(() => {
    let active = true
    const previous = document.activeElement as HTMLElement | null
    const previousTitle = document.title
    document.title = filename.slice(0, -4)
    const root = document.getElementById('root')
    const inert = root?.inert
    if (root) root.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    container.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    void document.fonts.ready.then(() => { if (active) setFontsReady(true) })
    return () => {
      active = false
      if (root) root.inert = inert || false
      document.body.style.overflow = overflow
      document.title = previousTitle
      previous?.focus()
    }
  }, [])
  useEffect(() => {
    let active = true
    void import('qrcode').then(({ toDataURL }) => toDataURL(link, {
      errorCorrectionLevel: 'M', width: 512, margin: 4,
      color: { dark: '#102e37ff', light: '#ffffffff' },
    })).then(value => { if (active) setQr(value) }).catch(() => { if (active) setError(t('No se pudo generar el QR. Cerrá el documento y volvé a intentarlo.')) })
    return () => { active = false }
  }, [link])
  const date = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { dateStyle: 'long' })
  return createPortal(<div className="delivery-document-portal" role="dialog" aria-modal="true" aria-label={t('Vista previa del PDF de entrega')} ref={container} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key === 'Tab') {
      const controls = [...container.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <div className="delivery-document-toolbar">
      <div className="min-w-0"><strong>{t('Vista previa de entrega')}</strong><p>{t('Elegí «Guardar como PDF» en la ventana de impresión. Desactivá los encabezados y pies del navegador para una entrega limpia.')}</p><p className="break-words">{t('Nombre de archivo sugerido')}: <span data-delivery-filename>{filename}</span></p></div>
      <div className="flex shrink-0 flex-wrap gap-2"><button className="btn-primary" disabled={!qr || !fontsReady || !link} onClick={() => window.print()}>{t('Imprimir / Guardar PDF')}</button><button onClick={onClose}>{t('Cerrar vista previa')}</button></div>
      {error && <p role="alert">{t(error)}</p>}
    </div>
    <article className="delivery-document-paper" aria-label={t('Documento de entrega')}>
      <header className="delivery-document-heading"><div className="delivery-document-brand"><span className="delivery-document-mark" aria-hidden="true">360°</span><div><p className="delivery-document-eyebrow">{t('RECORRIDO VIRTUAL')}</p><p className="delivery-document-studio">{settings.studio_name}</p></div></div><span className="delivery-document-tag">Vision360</span></header>
      <div className="delivery-document-intro"><p className="delivery-document-eyebrow">{t('TU ESPACIO, LISTO PARA EXPLORAR')}</p><h1>{job.title}</h1><DocumentIdentity job={job} clientName={clientName} studioName={settings.studio_name} issuedAt={issuedAt} paper /></div>
      <section className="delivery-document-visit"><div><p className="delivery-document-number">01 /</p><h2>{t('Explorá el recorrido')}</h2><p>{t('Abrí el enlace o escaneá el código QR con la cámara de tu celular.')}</p><a className="delivery-document-action" href={link}>{t('Abrir recorrido 360°')}<span aria-hidden="true"> ↗</span></a><a className="delivery-document-url" href={link}>{link}</a></div><div className="delivery-document-qr">{qr ? <img src={qr} width={512} height={512} alt={t('QR del recorrido publicado')} /> : <p role="status">{t('Generando tu QR…')}</p>}</div></section>
      {job.delivery_location && <section className="delivery-document-location"><p className="delivery-document-number">02 /</p><h2>{t('Ubicación y cómo llegar')}</h2><p>{job.delivery_location.label}</p><a className="delivery-document-action" href={directionsUrl(job.delivery_location)}>{t('Ver indicaciones en Google Maps')}<span aria-hidden="true"> ↗</span></a></section>}
      <section className="delivery-document-conditions"><p className="delivery-document-number">{job.delivery_location ? '03 /' : '02 /'}</p><h2>{t('Condiciones de entrega')}</h2><p>{settings.conditions}</p></section>
      <section className="delivery-document-contact"><h2>{t('Contacto y consultas')}</h2><p><strong>{settings.studio_name}</strong><br />{settings.contact}</p></section>
      <footer><p>{t('El recorrido se abre en Internet. Este documento conserva el enlace y las condiciones; no contiene una copia del recorrido.')}</p><p>{t('Documento generado el')} {date(issuedAt)} · Vision360</p><p>{t('Referencia')}: {job.id}</p></footer>
    </article>
  </div>, document.body)
}
