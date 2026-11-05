import { useEffect, useRef, useState } from 'react'
import type { Scene, SceneInput } from '../../api/client'
import { useBlockNavigation } from '../../app/navigation'

export function SceneForm({ scene, busy, onSave, onCancel }: {
  scene?: Scene; busy: boolean; onSave: (data: SceneInput) => Promise<void>; onCancel: () => void
}) {
  const [name, setName] = useState(scene?.name || '')
  const [yaw, setYaw] = useState(scene?.initial_yaw ?? 0)
  const [pitch, setPitch] = useState(scene?.initial_pitch ?? 0)
  const [hfov, setHfov] = useState(scene?.initial_hfov ?? 90)
  useBlockNavigation(name !== (scene?.name || '') || yaw !== (scene?.initial_yaw ?? 0) || pitch !== (scene?.initial_pitch ?? 0) || hfov !== (scene?.initial_hfov ?? 90))
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (scene) nameInput.current?.focus() }, [scene?.id])
  return <form onSubmit={(event) => {
    event.preventDefault(); void onSave({ name, initial_yaw: yaw, initial_pitch: pitch, initial_hfov: hfov })
  }}>
    <label>Nombre del ambiente<input ref={nameInput} placeholder="Ej. Living, Cocina o Terraza" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <details className="mb-5 rounded-xl border border-line p-3"><summary>Vista inicial · opcional</summary><p className="my-3 text-xs leading-relaxed text-muted">Podés dejar estos valores como están. Después, acomodá la foto en el editor y usá «Guardar vista actual como inicial».</p><div className="angle-fields sm:grid-cols-1">
      <label>Yaw (°)<input type="number" min={-180} max={179.99} step="any" required value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /></label>
      <label>Pitch (°)<input type="number" min={-90} max={90} step="any" required value={pitch} onChange={(event) => setPitch(Number(event.target.value))} /></label>
      <label>Campo de visión (°)<input type="number" min={50} max={110} step="any" required value={hfov} onChange={(event) => setHfov(Number(event.target.value))} /></label>
    </div></details>
    <button className="btn-primary w-full" disabled={busy}>{scene ? 'Guardar ambiente' : 'Agregar ambiente'}</button>{' '}
    {scene && <button type="button" disabled={busy} onClick={onCancel}>Cancelar edición</button>}
  </form>
}
