import { useRef, useState } from 'react'
import { businessApi } from '../../api/business'
import type { components } from '../../api/schema'

export function ServiceForm({ studioToken, studioName }: { studioToken?: string; studioName?: string } = {}) {
  const submission = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<components['schemas']['ServiceReceipt'] | null>(null)
  if (receipt) return <div className="card p-6 sm:p-8" role="status"><span className="badge badge-ready mb-4">Solicitud recibida</span><h3>Ya registramos tu consulta.</h3><p className="muted my-4">{studioName ? `El estudio ${studioName} podrá revisar los datos para coordinar la digitalización.` : 'El equipo de Vision360 podrá revisar los datos para coordinar la digitalización.'} No realizaste ningún pago ni reservaste una fecha.</p><p className="text-xs text-muted">Tu referencia</p><p className="mt-2 break-all font-mono text-sm">{receipt.id}</p><button className="mt-6" onClick={() => { submission.current = crypto.randomUUID(); setReceipt(null) }}>Enviar otra solicitud</button></div>
  return <form className="card p-5 sm:p-8" aria-label="Solicitar digitalización" onSubmit={async (event) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      const result = await businessApi.submitService({ submission_id: submission.current, name: String(data.get('name')),
        email: String(data.get('email')), whatsapp: String(data.get('whatsapp')),
        property_kind: String(data.get('property_kind')) as components['schemas']['ServiceInput']['property_kind'],
        locality: String(data.get('locality')), area_m2: Number(data.get('area_m2')), rooms: Number(data.get('rooms')),
        message: String(data.get('message')), website: String(data.get('website') || ''), consent: true }, studioToken)
      setReceipt(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar. Revisá la conexión y volvé a intentar.') }
    finally { setBusy(false) }
  }}>
    <h3 className="mb-2 text-xl">Contanos sobre tu espacio</h3><p className="muted mb-6">Te pedimos los datos necesarios para evaluar el trabajo. Sin compromiso de contratación.</p>
    <fieldset disabled={busy}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <label>Nombre<input name="name" autoComplete="name" required minLength={2} maxLength={160} /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>WhatsApp<input name="whatsapp" type="tel" autoComplete="tel" placeholder="+54 9 11…" required minLength={7} maxLength={40} /></label>
        <label>Tipo de propiedad<select name="property_kind" required defaultValue=""><option value="" disabled>Seleccioná una opción</option><option value="casa">Casa</option><option value="departamento">Departamento</option><option value="local">Local comercial</option><option value="oficina">Oficina</option><option value="hotel">Hotel o alojamiento</option><option value="otro">Otro espacio</option></select></label>
        <label>Localidad<input name="locality" required minLength={2} maxLength={160} autoComplete="address-level2" /></label>
        <label>Superficie aproximada (m²)<input name="area_m2" type="number" required min={1} max={10000000} step="any" /></label>
        <label>Cantidad de ambientes<input name="rooms" type="number" required min={1} max={10000} step={1} /></label>
      </div>
      <label>Mensaje adicional<textarea name="message" maxLength={5000} placeholder="Contanos qué querés mostrar y si tenés alguna fecha en mente." /></label>
      <div className="sr-only" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="!flex-row !items-start !text-xs !font-normal"><input name="consent" type="checkbox" required className="mt-0.5 !size-4 !min-h-4 shrink-0 accent-accent" /><span>{studioName ? `Acepto que ${studioName} reciba estos datos a través de Vision360 y me contacte para responder esta solicitud.` : 'Acepto que Vision360 guarde estos datos y me contacte para responder esta solicitud.'} No los uses para incluir información sensible.</span></label>
      {error && <p role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enviando solicitud…' : 'Enviar solicitud de digitalización'}</button>
      {busy && <p className="mt-3 text-center" role="status">Registrando tu solicitud…</p>}
    </fieldset>
  </form>
}
