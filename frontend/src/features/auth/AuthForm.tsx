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
    <p className="eyebrow section-heading text-accent">Mostrá el espacio, contá su historia</p><h2 className="mt-4 text-4xl leading-tight tracking-tight lg:text-5xl">Tu próxima visita<br />empieza acá.</h2><p className="mt-5 max-w-sm text-muted">Creá un recorrido que tus clientes puedan explorar a su ritmo. Sin instalar una app.</p>
    <ol className="mt-8 space-y-4">{['Cargá una foto 360° por ambiente', 'Conectá los espacios con puntos', 'Publicá y compartí tu recorrido'].map((text, index) => <li key={text} className="flex items-center gap-3 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{index + 1}</span>{text}</li>)}</ol>
    <p className="mt-8 text-xs text-subtle">Necesitás fotos panorámicas 360° completas. Podés empezar con una imagen de muestra.</p>
  </div><section className="auth-panel card order-first p-6 sm:p-8 lg:order-last">
    <p className="eyebrow mb-2">Bienvenido a Vision360</p><h2>{mode === 'forgot' ? 'Recuperar contraseña' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</h2><p className="muted mt-2 mb-6">{mode === 'forgot' ? 'Ingresá tu email para pedir un enlace de recuperación.' : mode === 'login' ? 'Tus recorridos te están esperando.' : 'Creá tu cuenta y prepará tu primera visita virtual.'}</p>
    {selectedPlan && <p className="mb-5 rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm">Elegiste {publicPlanNames[selectedPlan]}. {mode === 'login' ? 'Ingresá para continuar con tu elección.' : 'Creá tu cuenta para continuar con tu elección.'}{selectedPlan !== 'trial' && <span className="mt-2 block text-xs text-muted">El plan es mensual. Después del registro coordinás el pago personalmente y administración lo habilita. No se realiza ningún cobro automático.</span>}</p>}
    {mode === 'forgot' && <EmailDeliveryHint />}
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('')
      if (mode === 'forgot') {
        try { await getSession(); const result = await request<{ message: string }>('/auth/forgot-password', 'POST', { email }); setMessage(result.message) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo pedir el enlace.') }
        finally { setBusy(false) }
        return
      }
      try { const state = await authenticate(mode, { email, password }); setPassword(''); onSession(state) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión') }
      finally { setBusy(false) }
    }}>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {mode !== 'forgot' && <><label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <p className="field-hint">Entre 12 y 128 caracteres.</p></>}
      {error && <p role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Procesando…' : mode === 'forgot' ? 'Enviar enlace de recuperación' : mode === 'login' ? 'Ingresar' : 'Registrarme'}</button>
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </form>
    {mode === 'login' && <button type="button" className="btn-quiet mt-3 w-full" disabled={busy} onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>Olvidé mi contraseña</button>}
    <button className="btn-quiet mt-3 w-full" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage('') }}>
      {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo una cuenta'}
    </button>
  </section></div>
}
