import { useEffect, useState } from 'react'
import { publicationsApi } from '../../api/client'
import type { PublicationState, Tour } from '../../api/client'
import { Icon } from '../../components/Icon'

export function PublicationPanel({ tour, onChanged }: { tour: Tour; onChanged: () => Promise<void> }) {
  const [state, setState] = useState<PublicationState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    publicationsApi.state(tour.id).then((result) => { if (active) { setState(result); setError('') } })
      .catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [tour.id, tour.revision, retry])
  useEffect(() => {
    if (!state?.preparing) return
    let active = true
    const timer = setTimeout(() => {
      publicationsApi.state(tour.id).then(async (result) => {
        if (!active) return
        setState(result)
        if (!result.preparing) await onChanged()
      }).catch((cause: Error) => { if (active) setError(cause.message) })
    }, 1500)
    return () => { active = false; clearTimeout(timer) }
  }, [state, tour.id, retry])
  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la publicación.') }
    finally { setBusy(false) }
  }
  const link = state ? new URL(state.path, window.location.origin).href : ''
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return <section className="publication-panel" aria-label="Publicación">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name="globe" /></span><div><h3>Publicación</h3><p className="mt-1 text-xs text-muted">Vos decidís cuándo está listo para recibir visitas.</p></div></div>
    {error && <><p role="alert">{error}</p><button onClick={() => setRetry((value) => value + 1)}>Actualizar publicación</button></>}
    {!state && !error && <p role="status">Consultando publicación…</p>}
    {state && <>
      <p>{state.status === 'published' ? `Versión ${state.version} publicada.` : 'El recorrido todavía no está publicado.'}</p>
      {state.has_changes && <p>Cambios pendientes: la versión pública se mantiene hasta que vuelvas a publicar.</p>}
      {state.preparing && <p role="status">Preparando publicación. Estamos dejando listas las imágenes; el enlace se activará al terminar.</p>}
      {state.error_message && <p role="alert">{state.error_message}</p>}
      {state.status === 'published' && <>
        <p><a href={state.path} target="_blank" rel="noopener noreferrer">Abrir recorrido público</a></p>
        <label>Enlace del recorrido<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
        <button onClick={() => { void act(async () => {
          if (!navigator.clipboard) throw new Error('Seleccioná y copiá el enlace del campo anterior.')
          await navigator.clipboard.writeText(link); setMessage('Enlace copiado.')
        }) }}>Copiar enlace</button>
        {local && <p>Este enlace funciona en esta computadora. Para enviarlo y abrirlo desde Internet necesitamos desplegar la app.</p>}
      </>}
      <div className="row-actions">
        <button disabled={busy || state.preparing || (state.status === 'published' && !state.has_changes)} onClick={() => void act(async () => {
          const check = await publicationsApi.check(tour.id)
          if (check.errors.length) throw new Error(check.errors.join('. '))
          const warning = check.unreachable_scenes.length ? ` Estos ambientes sólo se alcanzan por la lista: ${check.unreachable_scenes.join(', ')}.` : ''
          if (!window.confirm(`¿Publicar el recorrido? Las fotos y los textos quedarán accesibles para quien tenga el enlace.${warning}`)) return
          setState(await publicationsApi.publish(tour.id, check.revision, check.unreachable_scenes.length > 0))
        })}>{state.status === 'published' ? 'Publicar cambios' : 'Publicar recorrido'}</button>
        {(state.status === 'published' || state.preparing) && <button disabled={busy} onClick={() => void act(async () => {
          if (!window.confirm('¿Despublicar el recorrido? El enlace dejará de abrirlo. Las imágenes descargadas o en caché pueden conservarse.')) return
          setState(await publicationsApi.unpublish(tour.id)); await onChanged()
        })}>Despublicar recorrido</button>}
      </div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
