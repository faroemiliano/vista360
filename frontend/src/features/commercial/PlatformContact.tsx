import { useRef, useState } from 'react'
import { getSession, request } from '../../api/client'
import type { components } from '../../api/schema'

export const ownerWhatsApp = `https://wa.me/5491170612602?text=${encodeURIComponent('Hola Emiliano, quiero saber más sobre Vision360.')}`

export function PlatformContact() {
  const submission = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  return <section id="contacto" className="grid scroll-mt-6 gap-8 border-t border-line/60 py-16 lg:grid-cols-2 lg:gap-12" aria-labelledby="contacto-titulo">
    <div>
      <p className="eyebrow mb-4 text-accent">Conocé Vision360</p>
      <h2 id="contacto-titulo" className="text-3xl sm:text-4xl">Tu estudio, tus recorridos.<br /><span className="hero-gradient">Hablemos de cómo empezar.</span></h2>
      <p className="muted mt-5">Vision360 te permite crear recorridos virtuales con fotos 360°, conectar ambientes, organizar clientes y trabajos, y compartir una visita mediante un enlace.</p>
      <p className="muted mt-4">Soy Emiliano, creador del sistema. Si querés conocer cómo funciona, cómo usarlo en tu negocio o consultar sobre su seguridad antes de registrarte, escribime. No necesitás una cuenta.</p>
      <details className="mt-6 rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">Cómo protegemos tu cuenta y tus datos</summary>
        <p className="muted mt-3 text-sm">Las contraseñas no se guardan en texto legible. Los clientes y trabajos se consultan según los permisos de cada cuenta. Vos elegís cuándo publicar tus recorridos; los datos de contacto y las notas internas no se muestran en la visita pública.</p>
      </details>
      <a href="mailto:farixio.tech@gmail.com" className="mt-5 inline-flex min-h-11 items-center break-all text-sm text-accent underline underline-offset-4">farixio.tech@gmail.com</a>
    </div>
    {receipt ? <div className="card p-6 sm:p-8" role="status">
      <h3>Tu consulta quedó registrada.</h3><p className="muted mt-3">Emiliano recibirá el aviso por email para responderte. También podés escribirle por WhatsApp.</p>
      <p className="mt-4 break-all text-xs text-subtle">Referencia: {receipt}</p>
      <button className="mt-5" onClick={() => { submission.current = crypto.randomUUID(); setReceipt(null) }}>Enviar otra consulta</button>
    </div> : <form className="card min-w-0 p-5 sm:p-8" aria-label="Consultar sobre Vision360" onSubmit={async event => {
      event.preventDefault(); if (busy) return
      const data = new FormData(event.currentTarget)
      setBusy(true); setError('')
      try {
        await getSession()
        const result = await request<components['schemas']['PlatformContactReceipt']>('/platform-contact', 'POST', {
          submission_id: submission.current, email: String(data.get('email')), phone: String(data.get('phone')),
          message: String(data.get('message')), website: String(data.get('website') || ''),
        })
        setReceipt(result.id)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar la consulta. Intentá nuevamente o escribime por WhatsApp.') }
      finally { setBusy(false) }
    }}>
      <h3 className="mb-5 text-xl">Consultá con el creador</h3>
      <fieldset disabled={busy}>
        <label>Email de contacto<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vos@ejemplo.com" /></label>
        <label>Teléfono de contacto<input name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={40} pattern="\+?[0-9\s\(\)\.\-]+" placeholder="Ej. 11 2345-6789" /></label>
        <p className="field-hint">Incluí el código de área. Para otro país, usá + y su código.</p>
        <label>Tu consulta<textarea name="message" required minLength={10} maxLength={5000} rows={4} placeholder="Contame qué te gustaría saber sobre Vision360." /></label>
        <div className="sr-only" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p className="mb-4 text-xs leading-relaxed text-muted">Ingresá un email y teléfono donde podamos responderte. Usaremos estos datos para atender tu consulta.</p>
        {error && <p role="alert" className="mb-4 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar consulta'}</button>
      </fieldset>
    </form>}
  </section>
}

export function FloatingWhatsApp() {
  return <a href={ownerWhatsApp} target="_blank" rel="noopener noreferrer" aria-label="Consultar a Emiliano por WhatsApp" title="WhatsApp · 11 7061-2602" className="fixed right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-semibold text-[#062d16] shadow-lg hover:bg-[#36e879] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:right-6" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.7a8.5 8.5 0 1 1 16.3-3.8Z" /><path d="m8.2 7.3 1.4 2.4-1 1.1a9 9 0 0 0 4.6 4l1-1.1 2.5 1.1c-.2 2-2.2 2.1-3.6 1.4-3.1-1.5-5.6-4-6-6-.3-1.5.1-2.5 1.1-2.9Z" /></svg>
    <span className="hidden sm:inline">WhatsApp</span>
  </a>
}
