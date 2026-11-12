import { useId, useState } from 'react'
import { t } from '../../i18n'

const html = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export function EmbedPanel({ link, title }: { link: string; title: string }) {
  const id = useId()
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const url = new URL(link)
  url.pathname = url.pathname.replace(/^\/tour\//, '/embed/')
  url.search = ''; url.hash = ''
  const code = `<iframe\n  src="${html(url.href)}"\n  title="${html(title)}"\n  width="100%"\n  height="600"\n  style="display:block;width:100%;height:clamp(360px,65vh,720px);border:0;border-radius:16px;"\n  loading="lazy"\n  allow="fullscreen; accelerometer; gyroscope"\n  allowfullscreen\n  referrerpolicy="strict-origin-when-cross-origin"\n></iframe>`
  return <details className="mt-5 rounded-xl border border-line p-4" onToggle={event => { if (!event.currentTarget.open) setPreview(false) }}>
    <summary>{t('Insertar en mi web')}</summary>
    <p className="muted mt-4">{t('El equipo de marketing puede pegar este código en un bloque HTML de su página. El recorrido se muestra dentro de la web del cliente, sin el logo ni el WhatsApp de Vision360.')}</p>
    <label htmlFor={id} className="mt-4 block text-sm font-medium">{t('Código para insertar')}</label>
    <textarea id={id} className="mt-2 min-h-48 font-mono text-xs" readOnly value={code} spellCheck={false} onFocus={event => event.currentTarget.select()} />
    <div className="row-actions">
      <button type="button" onClick={async () => {
        setMessage(''); setError('')
        try {
          if (!navigator.clipboard) throw new Error(t('Seleccioná el código y copialo manualmente.'))
          await navigator.clipboard.writeText(code); setMessage(t('Código copiado. Ya podés enviarlo al equipo de marketing.'))
        } catch { setError(t('Seleccioná el código y copialo manualmente.')) }
      }}>{t('Copiar código')}</button>
      <button type="button" aria-expanded={preview} aria-controls={`${id}-preview`} onClick={() => setPreview(!preview)}>{preview ? t('Ocultar vista previa web') : t('Ver vista previa web')}</button>
      <a className="text-sm text-accent underline" href={url.href} target="_blank" rel="noopener noreferrer">{t('Abrir vista para insertar')}</a>
    </div>
    {message && <p role="status">{t(message)}</p>}{error && <p role="alert">{t(error)}</p>}
    {preview && <section id={`${id}-preview`} aria-label={t('Ejemplo en la web del cliente')} className="overflow-hidden rounded-xl border border-line bg-white text-slate-900">
      <div className="border-b border-slate-200 px-4 py-3"><p className="text-xs text-slate-500">{t('Vista previa · Web del cliente')}</p><h4 className="mt-1 break-words">{title}</h4></div>
      <iframe title={t('Vista previa del recorrido insertado')} src={url.href} className="block h-[480px] w-full border-0" allow="fullscreen; accelerometer; gyroscope" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </section>}
    <p className="field-hint mt-4 mb-0">{t('Al publicar cambios se actualiza también esta integración. El recorrido sigue alojado en Vision360: debe permanecer publicado y con alojamiento activo.')}</p>
    {['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && <p className="field-hint mb-0">{t('Este código es local. Para usarlo en la web del cliente, copialo desde la versión desplegada.')}</p>}
  </details>
}
