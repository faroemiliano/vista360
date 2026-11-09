import { useEffect, useRef, useState } from 'react'
import { getSession, request, uploadAvatar } from '../../api/client'
import type { SessionState, User } from '../../api/client'
import { useBlockNavigation } from '../../app/navigation'
import { AccountAccess, EmailDeliveryHint } from './AccountSecurity'
import { MyPlan } from '../subscriptions/MyPlan'
import { UserAvatar } from './UserAvatar'

export function MyAccount({ user, onClose, onUser, onSession, onLogout }: {
  user: User; onClose: () => void; onUser: (user: User) => void; onSession: (state: SessionState) => void; onLogout: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const photo = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'profile' | 'access' | 'plan'>('profile')
  const [name, setName] = useState(user.display_name || '')
  const [kind, setKind] = useState(user.account_kind || 'individual')
  const [phone, setPhone] = useState(user.phone || '')
  const [company, setCompany] = useState(user.company_name || '')
  const [busy, setBusy] = useState(false)
  const [securityBusy, setSecurityBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dirty = name !== (user.display_name || '') || kind !== user.account_kind || phone !== (user.phone || '')
    || (kind === 'company' && company !== (user.company_name || ''))
  useBlockNavigation(dirty)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  const locked = busy || securityBusy
  function close() { if (!locked && (!dirty || window.confirm('¿Descartar los cambios sin guardar de Mi cuenta?'))) onClose() }
  async function act(action: () => Promise<void>) {
    if (locked) return
    setBusy(true); setError(''); setMessage('')
    try { await getSession(); await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface-900 p-5 text-ink backdrop:bg-black/70 sm:p-7" aria-labelledby="mi-cuenta-titulo">
    <div className="flex items-center justify-between gap-3"><h2 id="mi-cuenta-titulo">Mi cuenta</h2><button className="size-11 shrink-0 !p-2" disabled={locked} onClick={close} aria-label="Cerrar Mi cuenta"><span aria-hidden="true">×</span></button></div>
    <p className="muted mt-2 text-sm">Tu perfil y el acceso a Vision360.</p>
    <div className="my-5 flex flex-wrap gap-2" aria-label="Secciones de Mi cuenta">
      <button aria-pressed={tab === 'profile'} disabled={locked} className={tab === 'profile' ? 'btn-primary' : ''} onClick={() => { setTab('profile'); setError(''); setMessage('') }}>Datos de mi cuenta</button>
      <button aria-pressed={tab === 'access'} disabled={locked} className={tab === 'access' ? 'btn-primary' : ''} onClick={() => { setTab('access'); setError(''); setMessage('') }}>Email y contraseña</button>
      <button aria-pressed={tab === 'plan'} disabled={locked} className={tab === 'plan' ? 'btn-primary' : ''} onClick={() => { setTab('plan'); setError(''); setMessage('') }}>Mi plan</button>
    </div>
    {tab === 'profile' ? <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <UserAvatar user={user} className="size-20 text-2xl" />
        <div className="min-w-0"><div className="flex flex-wrap gap-2"><button disabled={locked} onClick={() => photo.current?.click()}>{user.avatar_url ? 'Cambiar foto' : 'Subir foto'}</button>{user.avatar_url && <button disabled={locked} onClick={() => void act(async () => { onUser(await request<User>('/auth/avatar', 'DELETE')); setMessage('Foto eliminada.') })}>Quitar foto</button>}</div><p className="mt-2 text-xs text-muted">JPG, PNG o WebP · Hasta 5 MiB</p></div>
        <input className="sr-only" ref={photo} aria-label="Foto de perfil" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (!file) return
          if (file.size > 5 * 1024 * 1024) { setError('La foto debe pesar hasta 5 MiB.'); return }
          void act(async () => { onUser(await uploadAvatar(file)); setMessage('Foto de perfil actualizada.') })
        }} />
      </div>
      <form aria-label="Datos de mi cuenta" onSubmit={event => {
        event.preventDefault()
        void act(async () => {
          const saved = await request<User>('/auth/profile', 'PUT', { display_name: name, account_kind: kind, phone: phone || null, company_name: kind === 'company' ? company || null : null })
          onUser(saved); setName(saved.display_name); setKind(saved.account_kind); setPhone(saved.phone || ''); setCompany(saved.company_name || ''); setMessage('Datos de cuenta guardados.')
        })
      }}>
        <fieldset disabled={locked} className="grid gap-x-5 sm:grid-cols-2">
          <label className="sm:col-span-2">Nombre y apellido<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Tipo de cuenta<select value={kind} onChange={event => setKind(event.target.value as User['account_kind'])}><option value="individual">Particular</option><option value="company">Empresa</option></select></label>
          <label>Teléfono<input type="tel" maxLength={40} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
          {kind === 'company' && <label className="sm:col-span-2">Nombre de la empresa<input maxLength={200} autoComplete="organization" value={company} onChange={event => setCompany(event.target.value)} /></label>}
          <button className="btn-primary sm:col-span-2">{busy ? 'Guardando…' : 'Guardar datos de mi cuenta'}</button>
        </fieldset>
      </form>
      <p className="mt-5 break-words text-xs text-muted">Email de acceso: {user.email_normalized}</p>
      <p className="mt-2 text-xs text-muted">Miembro desde {new Date(user.created_at).toLocaleDateString('es-AR')}</p>
    </> : tab === 'plan' ? <MyPlan /> : <>
      <details className="mb-6 rounded-xl border border-line p-4">
        <summary>Cambiar email de acceso</summary>
        {user.pending_email && <div className="my-4 text-sm"><p className="break-words">Pendiente de confirmar: {user.pending_email}</p><button className="mt-2" disabled={locked} onClick={() => void act(async () => { onUser(await request<User>('/auth/change-email', 'DELETE')); setMessage('Cambio de email cancelado.') })}>Cancelar cambio de email</button></div>}
        <p className="muted mt-4 break-words text-sm">Email actual: {user.email_normalized}. El nuevo email se usará después de confirmarlo.</p>
        <EmailDeliveryHint />
        <form aria-label="Cambiar email" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
          void act(async () => {
            const result = await request<{ message: string }>('/auth/change-email', 'POST', { email: data.get('email'), current_password: data.get('password') })
            onSession(await getSession()); form.reset(); setMessage(result.message)
          })
        }}>
          <fieldset disabled={locked} className="mt-4"><label>Nuevo email<input type="email" name="email" autoComplete="email" required maxLength={254} /></label><label>Contraseña actual para cambiar email<input type="password" name="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label><button>Solicitar cambio de email</button></fieldset>
        </form>
      </details>
      <AccountAccess user={user} onSession={onSession} onBusyChange={setSecurityBusy} />
    </>}
    <div className="mt-6 border-t border-line pt-4"><button className="btn-quiet" disabled={locked} onClick={() => void act(onLogout)}>Cerrar sesión</button></div>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}{error && <p role="alert" className="mt-4 text-sm">{error}</p>}
  </dialog>
}
