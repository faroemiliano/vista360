import { useEffect, useState } from 'react'
import { getSession, logout, request, updateSession } from '../../api/client'
import type { SessionState, User } from '../../api/client'

export function EmailDeliveryHint() {
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    request<{ general_delivery_available: boolean }>('/auth/email-status').then(result => { if (active) setAvailable(result.general_delivery_available) }).catch(() => { if (active) setAvailable(false) })
    return () => { active = false }
  }, [])
  return available === false ? <p className="my-4 text-xs leading-relaxed text-muted">El envío de correos todavía está limitado durante esta prueba. Si no recibís el enlace, <a href="/inicio#contacto" className="text-accent underline">contactá al creador desde el inicio</a>.</p> : null
}

export function VerificationPending({ user, onSession }: { user: User; onSession: (state: SessionState) => void }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function act(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.') }
    finally { setBusy(false) }
  }
  return <section className="card mx-auto max-w-lg p-6 sm:p-8" aria-label="Verificación de email">
    <h1 className="text-2xl">Verificá tu email</h1>
    <p className="muted mt-4 break-words">Para acceder a tu estudio, abrí el enlace de verificación de {user.email_normalized} y confirmá tu email. Revisá también spam.</p>
    <EmailDeliveryHint />
    <div className="mt-5 flex flex-wrap gap-3">
      <button className="btn-primary" disabled={busy} onClick={() => void act(async () => { onSession(await getSession()) })}>Ya verifiqué mi email</button>
      <button disabled={busy} onClick={() => void act(async () => { await getSession(); const result = await request<{ message: string }>('/auth/resend-verification', 'POST'); setMessage(result.message) })}>Reenviar verificación</button>
      <button disabled={busy} onClick={() => void act(async () => { onSession(await logout()) })}>Cerrar sesión</button>
    </div>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>
}

export function AccountAccess({ user, onSession, onBusyChange }: { user: User; onSession: (state: SessionState) => void; onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  return <section aria-label="Seguridad de acceso">
    <p className="muted my-4 break-words text-sm">{user.email_normalized} · {user.email_verified_at ? 'Email verificado' : 'Email sin verificar'}</p>
    {!user.email_verified_at && <button disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { await getSession(); const result = await request<{ message: string }>('/auth/resend-verification', 'POST'); setMessage(result.message) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo pedir la verificación.') }
      finally { setBusy(false) }
    }}>Solicitar verificación de email</button>}
    {!user.email_verified_at && <EmailDeliveryHint />}
    <form className="mt-5" aria-label="Cambiar contraseña" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
      if (data.get('password') !== data.get('confirm')) { setError('Las contraseñas nuevas no coinciden.'); return }
      setBusy(true); setError(''); setMessage('')
      try {
        await getSession()
        const state = await request<SessionState>('/auth/change-password', 'POST', { current_password: data.get('current'), password: data.get('password') })
        updateSession(state); onSession(state); form.reset(); setMessage('Contraseña actualizada. Cerramos las otras sesiones de tu cuenta.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la contraseña.') }
      finally { setBusy(false) }
    }}>
      <fieldset disabled={busy}>
        <label>Contraseña actual<input name="current" type="password" required minLength={12} maxLength={128} autoComplete="current-password" /></label>
        <label>Nueva contraseña<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <label>Repetir nueva contraseña<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <p className="field-hint">Entre 12 y 128 caracteres. Se cerrarán las demás sesiones al guardar.</p>
        <button className="btn-primary w-full">{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </fieldset>
    </form>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}{error && <p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>
}
