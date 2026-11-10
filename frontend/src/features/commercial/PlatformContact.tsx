import { t } from '../../i18n'
import { useRef, useState } from 'react'
import { publicPlan, publicPlanNames } from '../subscriptions/selection'
import { getSession, request } from '../../api/client'
import type { components } from '../../api/schema'

export const ownerWhatsApp = `https://wa.me/5491170612602?text=${encodeURIComponent('Hola Emiliano, quiero saber más sobre Vision360.')}`

export function PlatformContact() {
  const selectedPlan = publicPlan(new URLSearchParams(window.location.search).get('plan'))
  const submission = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  return <section id="contacto" className="grid scroll-mt-6 gap-8 border-t border-line/60 py-16 lg:grid-cols-2 lg:gap-12" aria-labelledby="contacto-titulo">
    <div>
      <p className="eyebrow mb-4 text-accent">{t("Conocé Vision360")}</p>
      <h2 id="contacto-titulo" className="text-3xl sm:text-4xl">{t("Tu estudio, tus recorridos.")}<br /><span className="hero-gradient">{t("Hablemos de cómo empezar.")}</span></h2>
      <p className="muted mt-5">{t("Vision360 te permite crear recorridos virtuales con fotos 360°, conectar ambientes, organizar clientes y trabajos, y compartir una visita mediante un enlace.")}</p>
      <p className="muted mt-4">{t("Soy Emiliano, creador del sistema. Si querés conocer cómo funciona, cómo usarlo en tu negocio o consultar sobre su seguridad antes de registrarte, escribime. No necesitás una cuenta.")}</p>
      <details className="mt-6 rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("Cómo protegemos tu cuenta y tus datos")}</summary>
        <p className="muted mt-3 text-sm">{t("Las contraseñas no se guardan en texto legible. Los clientes y trabajos se consultan según los permisos de cada cuenta. Vos elegís cuándo publicar tus recorridos; los datos de contacto y las notas internas no se muestran en la visita pública.")}</p>
      </details>
      <a href="mailto:farixio.tech@gmail.com" className="mt-5 inline-flex min-h-11 items-center break-all text-sm text-accent underline underline-offset-4">farixio.tech@gmail.com</a>
    </div>
    {receipt ? <div className="card p-6 sm:p-8" role="status">
      <h3>{t("Tu consulta quedó registrada.")}</h3><p className="muted mt-3">{t("Nuestro equipo recibirá tu consulta y se pondrá en contacto con vos a la brevedad. También podés comunicarte con nosotros por WhatsApp.")}</p>
      <p className="mt-4 break-all text-xs text-subtle">{t("Referencia:")} {receipt}</p>
      <button className="mt-5" onClick={() => { submission.current = crypto.randomUUID(); setReceipt(null) }}>{t("Enviar otra consulta")}</button>
    </div> : <form className="card min-w-0 p-5 sm:p-8" aria-label={t("Consultar sobre Vision360")} onSubmit={async event => {
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
      } catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo enviar la consulta. Intentá nuevamente o escribime por WhatsApp.")) }
      finally { setBusy(false) }
    }}>
      <h3 className="mb-5 text-xl">{t("Consultá con el creador")}</h3>
      <fieldset disabled={busy}>
        <label>{t("Email de contacto")}<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder={t("vos@ejemplo.com")} /></label>
        <label>{t("Teléfono de contacto")}<input name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={40} pattern="\+?[0-9\s\(\)\.\-]+" placeholder={t("Ej. 11 2345-6789")} /></label>
        <p className="field-hint">{t("Incluí el código de área. Para otro país, usá + y su código.")}</p>
        <label>{t("Tu consulta")}<textarea aria-label={t("Tu consulta")} name="message" defaultValue={selectedPlan ? t('Hola, me interesa activar el plan {0} de Vision360. Quisiera conocer el precio mensual, coordinar el pago personalmente y solicitar su habilitación.', [publicPlanNames[selectedPlan]]) : undefined} required minLength={10} maxLength={5000} rows={4} placeholder={t("Contame qué te gustaría saber sobre Vision360.")} /></label>
        <div className="sr-only" aria-hidden="true"><label>{t("Sitio web")}<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p className="mb-4 text-xs leading-relaxed text-muted">{t("Ingresá un email y teléfono donde podamos responderte. Usaremos estos datos para atender tu consulta.")}</p>
        {error && <p role="alert" className="mb-4 text-sm">{t(error)}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? t("Enviando…") : t("Enviar consulta")}</button>
      </fieldset>
    </form>}
  </section>
}

export function FloatingWhatsApp() {
  return <a href={`https://wa.me/5491170612602?text=${encodeURIComponent(t('Hola Emiliano, quiero saber más sobre Vision360.'))}`} target="_blank" rel="noopener noreferrer" aria-label={t("Consultar a Emiliano por WhatsApp")} title="WhatsApp · 11 7061-2602" className="fixed right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-semibold text-[#062d16] shadow-lg hover:bg-[#36e879] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:right-6" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.7a8.5 8.5 0 1 1 16.3-3.8Z" /><path d="m8.2 7.3 1.4 2.4-1 1.1a9 9 0 0 0 4.6 4l1-1.1 2.5 1.1c-.2 2-2.2 2.1-3.6 1.4-3.1-1.5-5.6-4-6-6-.3-1.5.1-2.5 1.1-2.9Z" /></svg>
    <span className="hidden sm:inline">WhatsApp</span>
  </a>
}
