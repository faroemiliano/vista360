import { t } from '../../i18n'
import { useState } from 'react'
import { publicPlanNames } from '../subscriptions/selection'
import type { PublicPlanCode } from '../subscriptions/selection'
import { EmailDeliveryHint } from './AccountSecurity'
import { authenticate, getSession, request } from '../../api/client'
import type { SessionState } from '../../api/client'

export function AuthForm({ onSession, initialMode = 'login', selectedPlan }: { onSession: (state: SessionState) => void; initialMode?: 'login' | 'register'; selectedPlan?: PublicPlanCode | '' }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="mx-auto grid max-w-4xl gap-10 py-8 lg:grid-cols-2 lg:items-center lg:py-16"><div id="guia" className="order-last lg:order-first">
    <p className="eyebrow section-heading text-accent">{t("Mostrá el espacio, contá su historia")}</p><h2 className="mt-4 text-4xl leading-tight tracking-tight lg:text-5xl">{t("Tu próxima visita")}<br />{t("empieza acá.")}</h2><p className="mt-5 max-w-sm text-muted">{t("Creá un recorrido que tus clientes puedan explorar a su ritmo. Sin instalar una app.")}</p>
    <ol className="mt-8 space-y-4">{[t("Cargá una foto 360° por ambiente"), t("Conectá los espacios con puntos"), t("Publicá y compartí tu recorrido")].map((text, index) => <li key={text} className="flex items-center gap-3 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{index + 1}</span>{text}</li>)}</ol>
    <p className="mt-8 text-xs text-subtle">{t("Necesitás fotos panorámicas 360° completas. Podés empezar con una imagen de muestra.")}</p>
  </div><section className="auth-panel card order-first p-6 sm:p-8 lg:order-last">
    <p className="eyebrow mb-2">{t("Bienvenido a Vision360")}</p><h2>{mode === 'forgot' ? t("Recuperar contraseña") : mode === 'login' ? t("Ingresar") : t("Crear cuenta")}</h2><p className="muted mt-2 mb-6">{mode === 'forgot' ? t("Ingresá tu email para pedir un enlace de recuperación.") : mode === 'login' ? t("Tus recorridos te están esperando.") : t("Creá tu cuenta y prepará tu primera visita virtual.")}</p>
    {selectedPlan && <p className="mb-5 rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm">{t("Elegiste")} {publicPlanNames[selectedPlan]}. {mode === 'login' ? t("Ingresá para continuar con tu elección.") : t("Creá tu cuenta para continuar con tu elección.")}{selectedPlan !== 'trial' && <span className="mt-2 block text-xs text-muted">{t("El plan es mensual. Después del registro coordinás el pago personalmente y administración lo habilita. No se realiza ningún cobro automático.")}</span>}</p>}
    {mode === 'forgot' && <EmailDeliveryHint />}
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('')
      if (mode === 'forgot') {
        try { await getSession(); const result = await request<{ message: string }>('/auth/forgot-password', 'POST', { email }); setMessage(result.message) }
        catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo pedir el enlace.")) }
        finally { setBusy(false) }
        return
      }
      try { const state = await authenticate(mode, { email, password }); setPassword(''); onSession(state) }
      catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo iniciar sesión")) }
      finally { setBusy(false) }
    }}>
      <label>{t("Email")}<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {mode !== 'forgot' && <><label>{t("Contraseña")}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <p className="field-hint">{t("Entre 12 y 128 caracteres.")}</p></>}
      {error && <p role="alert">{t(error)}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? t("Procesando…") : mode === 'forgot' ? t("Enviar enlace de recuperación") : mode === 'login' ? t("Ingresar") : t("Registrarme")}</button>
      {message && <p role="status" className="mt-4 text-sm">{t(message)}</p>}
    </form>
    {mode === 'login' && <button type="button" className="btn-quiet mt-3 w-full" disabled={busy} onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>{t("Olvidé mi contraseña")}</button>}
    <button className="btn-quiet mt-3 w-full" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage('') }}>
      {mode === 'login' ? t("Crear una cuenta") : t("Ya tengo una cuenta")}
    </button>
  </section></div>
}
