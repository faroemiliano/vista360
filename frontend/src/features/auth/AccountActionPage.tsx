import { LanguageSwitcher } from '../../i18n/LanguageSwitcher'
import { t, useLanguage } from '../../i18n'
import { useEffect, useState } from 'react'
import { getSession, request } from '../../api/client'
import { BrandMark } from '../../components/BrandMark'

export function AccountActionPage({ reset, changeEmail = false }: { reset: boolean; changeEmail?: boolean }) {
  const language = useLanguage()
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    // El enlace no se deja en el historial ni se consume al abrirlo (por ejemplo, por un escáner de correo).
    function readLink() {
      if (!window.location.hash) return
      setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
      setMessage(''); setError('')
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
    readLink()
    window.addEventListener('hashchange', readLink)
    return () => window.removeEventListener('hashchange', readLink)
  }, [reset, changeEmail])
  useEffect(() => {
    document.title = `${changeEmail ? t("Confirmar nuevo email") : reset ? t("Restablecer contraseña") : t("Verificar email")} · Vision360`
  }, [reset, changeEmail, language])
  return <main className="mx-auto max-w-lg py-10"><div className="mb-5 flex justify-end"><LanguageSwitcher /></div>
    <a href="/inicio" className="mb-8 inline-flex items-center gap-3 font-bold text-accent"><BrandMark className="size-9" />Vision360</a>
    <section className="card p-6 sm:p-8">
      <h1 className="text-2xl">{changeEmail ? t("Confirmá tu nuevo email") : reset ? t("Elegí tu nueva contraseña") : t("Verificá tu email")}</h1>
      {message ? <><p role="status" className="muted my-5">{t(message)}</p><a href="/studio" className="text-accent underline">{t("Ir al ingreso")}</a></> : !token ? <><p role="alert" className="my-4">{t("El enlace no contiene un código válido. Solicitá un enlace nuevo.")}</p><a href="/studio" className="text-accent underline">{t("Volver al ingreso")}</a></> : <form className="mt-5" onSubmit={async event => {
        event.preventDefault(); const data = new FormData(event.currentTarget)
        if (reset && data.get('password') !== data.get('confirm')) { setError(t("Las contraseñas no coinciden.")); return }
        setBusy(true); setError('')
        try {
          await getSession()
          const result = await request<{ message: string }>(changeEmail ? '/auth/confirm-email-change' : reset ? '/auth/reset-password' : '/auth/verify-email', 'POST', reset ? { token, password: data.get('password') } : { token })
          setMessage(result.message)
        } catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo completar la operación.")) }
        finally { setBusy(false) }
      }}>
        <fieldset disabled={busy}>
          {reset ? <><label>{t("Nueva contraseña")}<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><label>{t("Repetir nueva contraseña")}<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><p className="field-hint">{t("Entre 12 y 128 caracteres. Al cambiarla se cerrarán las sesiones anteriores.")}</p></> : <p className="muted mb-5">{changeEmail ? t("Al confirmar, se actualizará tu email y se cerrarán las sesiones anteriores. Después ingresá con el nuevo email.") : t("Confirmá para verificar la dirección de tu cuenta.")}</p>}
          <button className="btn-primary w-full">{busy ? t("Procesando…") : changeEmail ? t("Confirmar nuevo email") : reset ? t("Guardar nueva contraseña") : t("Confirmar mi email")}</button>
        </fieldset>
        {error && <><p role="alert" className="mt-4 text-sm">{t(error)}</p><a href="/studio" className="mt-3 inline-block text-sm text-accent underline">{t("Volver al ingreso y solicitar otro enlace")}</a></>}
      </form>}
    </section>
  </main>
}
