import { useEffect, useState } from 'react'
import { getSession, request } from '../../api/client'
import { BrandMark } from '../../components/BrandMark'

export function AccountActionPage({ reset }: { reset: boolean }) {
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
    document.title = `${reset ? 'Restablecer contraseña' : 'Verificar email'} · Vision360`
    return () => window.removeEventListener('hashchange', readLink)
  }, [reset])
  return <main className="mx-auto max-w-lg py-10">
    <a href="/inicio" className="mb-8 inline-flex items-center gap-3 font-bold text-accent"><BrandMark className="size-9" />Vision360</a>
    <section className="card p-6 sm:p-8">
      <h1 className="text-2xl">{reset ? 'Elegí tu nueva contraseña' : 'Verificá tu email'}</h1>
      {message ? <><p role="status" className="muted my-5">{message}</p><a href="/studio" className="text-accent underline">Ir al ingreso</a></> : !token ? <><p role="alert" className="my-4">El enlace no contiene un código válido. Solicitá un enlace nuevo.</p><a href="/studio" className="text-accent underline">Volver al ingreso</a></> : <form className="mt-5" onSubmit={async event => {
        event.preventDefault(); const data = new FormData(event.currentTarget)
        if (reset && data.get('password') !== data.get('confirm')) { setError('Las contraseñas no coinciden.'); return }
        setBusy(true); setError('')
        try {
          await getSession()
          const result = await request<{ message: string }>(reset ? '/auth/reset-password' : '/auth/verify-email', 'POST', reset ? { token, password: data.get('password') } : { token })
          setMessage(result.message)
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.') }
        finally { setBusy(false) }
      }}>
        <fieldset disabled={busy}>
          {reset ? <><label>Nueva contraseña<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><label>Repetir nueva contraseña<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><p className="field-hint">Entre 12 y 128 caracteres. Al cambiarla se cerrarán las sesiones anteriores.</p></> : <p className="muted mb-5">Confirmá para verificar la dirección de tu cuenta.</p>}
          <button className="btn-primary w-full">{busy ? 'Procesando…' : reset ? 'Guardar nueva contraseña' : 'Confirmar mi email'}</button>
        </fieldset>
        {error && <><p role="alert" className="mt-4 text-sm">{error}</p><a href="/studio" className="mt-3 inline-block text-sm text-accent underline">Volver al ingreso y solicitar otro enlace</a></>}
      </form>}
    </section>
  </main>
}
