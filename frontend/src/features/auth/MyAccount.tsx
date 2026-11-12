import { t, dateLocale } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { getSession, request, uploadAvatar } from '../../api/client'
import type { SessionState, User } from '../../api/client'
import { StudioLink } from '../../app/StudioLink'
import { useBlockNavigation } from '../../app/navigation'
import { AccountAccess, EmailDeliveryHint } from './AccountSecurity'
import type { PublicPlanCode } from '../subscriptions/selection'
import { MyPlan } from '../subscriptions/MyPlan'
import { UserAvatar } from './UserAvatar'

export function MyAccount({ user, onClose, onUser, onSession, onLogout, tab, selectedPlan }: {
  tab: 'profile' | 'access' | 'plan'; selectedPlan?: PublicPlanCode | '';
  user: User; onClose: () => void; onUser: (user: User) => void; onSession: (state: SessionState) => void; onLogout: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const photo = useRef<HTMLInputElement>(null)
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
  useBlockNavigation(dirty, () => {
    setName(user.display_name || ''); setKind(user.account_kind || 'individual'); setPhone(user.phone || ''); setCompany(user.company_name || '')
  })
  useEffect(() => { setError(''); setMessage('') }, [tab])
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  const locked = busy || securityBusy
  function close() { if (!locked && (!dirty || window.confirm(t("¿Descartar los cambios sin guardar de Mi cuenta?")))) onClose() }
  async function act(action: () => Promise<void>) {
    if (locked) return
    setBusy(true); setError(''); setMessage('')
    try { await getSession(); await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo guardar el cambio.")) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface-900 p-5 text-ink backdrop:bg-black/70 sm:p-7" aria-labelledby="mi-cuenta-titulo">
    <div className="flex items-center justify-between gap-3"><h2 id="mi-cuenta-titulo">{t("Mi cuenta")}</h2><button className="size-11 shrink-0 !p-2" disabled={locked} onClick={close} aria-label={t("Cerrar Mi cuenta")}><span aria-hidden="true">×</span></button></div>
    <p className="muted mt-2 text-sm">{t("Tu perfil y el acceso a Vision360.")}</p>
    <div className="my-5 flex flex-wrap gap-2" aria-label={t("Secciones de Mi cuenta")}>
      {([['profile', t('Datos de mi cuenta')], ['access', t('Email y contraseña')], ['plan', t('Mi plan')]] as const).map(([id, label]) => <StudioLink key={id} to={{ accountTab: id }} aria-current={tab === id ? 'page' : undefined} aria-disabled={locked || undefined} className={`nav-action ${tab === id ? 'btn-primary' : ''}`} onClick={event => { if (locked) event.preventDefault() }}>{label}</StudioLink>)}
    </div>
    {tab === 'profile' ? <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <UserAvatar user={user} className="size-20 text-2xl" />
        <div className="min-w-0"><div className="flex flex-wrap gap-2"><button disabled={locked} onClick={() => photo.current?.click()}>{user.avatar_url ? t("Cambiar foto") : t("Subir foto")}</button>{user.avatar_url && <button disabled={locked} onClick={() => void act(async () => { onUser(await request<User>('/auth/avatar', 'DELETE')); setMessage(t("Foto eliminada.")) })}>{t("Quitar foto")}</button>}</div><p className="mt-2 text-xs text-muted">{t("JPG, PNG o WebP · Hasta 5 MiB")}</p></div>
        <input className="sr-only" ref={photo} aria-label={t("Foto de perfil")} type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''
          if (!file) return
          if (file.size > 5 * 1024 * 1024) { setError(t("La foto debe pesar hasta 5 MiB.")); return }
          void act(async () => { onUser(await uploadAvatar(file)); setMessage(t("Foto de perfil actualizada.")) })
        }} />
      </div>
      <form aria-label={t("Datos de mi cuenta")} onSubmit={event => {
        event.preventDefault()
        void act(async () => {
          const saved = await request<User>('/auth/profile', 'PUT', { display_name: name, account_kind: kind, phone: phone || null, company_name: kind === 'company' ? company || null : null })
          onUser(saved); setName(saved.display_name); setKind(saved.account_kind); setPhone(saved.phone || ''); setCompany(saved.company_name || ''); setMessage(t("Datos de cuenta guardados."))
        })
      }}>
        <fieldset disabled={locked} className="grid gap-x-5 sm:grid-cols-2">
          <label className="sm:col-span-2">{t("Nombre y apellido")}<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
          <label>{t("Tipo de cuenta")}<select value={kind} onChange={event => setKind(event.target.value as User['account_kind'])}><option value="individual">{t("Particular")}</option><option value="company">{t("Empresa")}</option></select></label>
          <label>{t("Teléfono")}<input type="tel" maxLength={40} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label>
          {kind === 'company' && <label className="sm:col-span-2">{t("Nombre de la empresa")}<input maxLength={200} autoComplete="organization" value={company} onChange={event => setCompany(event.target.value)} /></label>}
          <button className="btn-primary sm:col-span-2">{busy ? t("Guardando…") : t("Guardar datos de mi cuenta")}</button>
        </fieldset>
      </form>
      <p className="mt-5 break-words text-xs text-muted">{t("Email de acceso:")} {user.email_normalized}</p>
      <p className="mt-2 text-xs text-muted">{t("Miembro desde")} {new Date(user.created_at).toLocaleDateString(dateLocale())}</p>
    </> : tab === 'plan' ? <MyPlan selectedPlan={selectedPlan} onStart={close} /> : <>
      <details className="mb-6 rounded-xl border border-line p-4">
        <summary>{t("Cambiar email de acceso")}</summary>
        {user.pending_email && <div className="my-4 text-sm"><p className="break-words">{t("Pendiente de confirmar:")} {user.pending_email}</p><button className="mt-2" disabled={locked} onClick={() => void act(async () => { onUser(await request<User>('/auth/change-email', 'DELETE')); setMessage(t("Cambio de email cancelado.")) })}>{t("Cancelar cambio de email")}</button></div>}
        <p className="muted mt-4 break-words text-sm">{t("Email actual:")} {user.email_normalized}{t(". El nuevo email se usará después de confirmarlo.")}</p>
        <EmailDeliveryHint />
        <form aria-label={t("Cambiar email")} onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
          void act(async () => {
            const result = await request<{ message: string }>('/auth/change-email', 'POST', { email: data.get('email'), current_password: data.get('password') })
            onSession(await getSession()); form.reset(); setMessage(result.message)
          })
        }}>
          <fieldset disabled={locked} className="mt-4"><label>{t("Nuevo email")}<input type="email" name="email" autoComplete="email" required maxLength={254} /></label><label>{t("Contraseña actual para cambiar email")}<input type="password" name="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label><button>{t("Solicitar cambio de email")}</button></fieldset>
        </form>
      </details>
      <AccountAccess user={user} onSession={onSession} onBusyChange={setSecurityBusy} />
    </>}
    <div className="mt-6 border-t border-line pt-4"><button className="btn-quiet" disabled={locked} onClick={() => void act(onLogout)}>{t("Cerrar sesión")}</button></div>
    {message && <p role="status" className="mt-4 text-sm">{t(message)}</p>}{error && <p role="alert" className="mt-4 text-sm">{t(error)}</p>}
  </dialog>
}
