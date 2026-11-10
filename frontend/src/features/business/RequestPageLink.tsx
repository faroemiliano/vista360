import { t } from '../../i18n'
import { useState } from 'react'
import { businessApi } from '../../api/business'
import { RequestQr } from './RequestQr'
import type { BusinessWorkspace } from '../../api/business'

export function RequestPageLink({ workspace, onChanged }: { workspace: BusinessWorkspace; onChanged: (value: BusinessWorkspace) => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const link = workspace.request_token ? `${window.location.origin}/solicitar/${workspace.request_token}` : ''
  async function toggle(enabled: boolean) {
    if (!enabled && !window.confirm(t("¿Desactivar el formulario? El enlace compartido dejará de recibir consultas. Las solicitudes guardadas se conservarán."))) return
    setBusy(true); setError(''); setMessage('')
    try { onChanged(await businessApi.requestPage(workspace.id, enabled)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo actualizar el formulario.")) }
    finally { setBusy(false) }
  }
  return <section className="card mb-8 p-5 sm:p-6" aria-label={t("Mi enlace de solicitudes")}>
    <p className="eyebrow mb-3 text-accent">{t("Tu puerta de entrada")}</p><h2 className="text-xl">{t("Recibí consultas para")} {workspace.name}</h2>
    <p className="muted my-4">{t("Compartí tu QR o el enlace del formulario con inmobiliarias y particulares. No necesitan registrarse y las consultas quedan en tu bandeja privada.")}</p>
    {link ? <>
      <RequestQr link={link} studioName={workspace.name} />
      <label className="block text-sm">{t("Mi enlace de solicitudes")}<input className="mt-2" readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="row-actions"><button className="btn-primary" onClick={async () => {
        setError('')
        try { await navigator.clipboard.writeText(link); setMessage(t("Enlace copiado. Ya podés compartirlo.")) }
        catch { setError(t("Seleccioná el enlace y copialo manualmente.")) }
      }}>{t("Copiar enlace")}</button><a href={link} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line px-4 py-3 text-sm">{t("Abrir formulario")}</a><button className="btn-quiet" disabled={busy} onClick={() => void toggle(false)}>{t("Desactivar enlace")}</button></div>
    </> : <button className="btn-primary" disabled={busy} onClick={() => void toggle(true)}>{busy ? t("Activando…") : t("Activar mi formulario")}</button>}
    {message && <p role="status" className="mt-3 text-accent">{t(message)}</p>}{error && <p role="alert">{t(error)}</p>}
  </section>
}
