import { useState } from 'react'
import { useBlockNavigation } from '../../app/navigation'
import { businessApi } from '../../api/business'
import type { BusinessWorkspace } from '../../api/business'

export function StudioIdentity({ workspace, workspaces, onSelect, onRenamed }: {
  workspace: BusinessWorkspace; workspaces: BusinessWorkspace[];
  onSelect: (id: string) => void; onRenamed: (workspace: BusinessWorkspace) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(workspace.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useBlockNavigation(editing && name !== workspace.name, () => { setEditing(false); setName(workspace.name) })
  return <div className="min-w-0 max-w-lg">
    <p className="eyebrow">{workspace.is_owner ? 'Tu estudio' : 'Estudio compartido'}</p>
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <h1 className="break-words text-base font-semibold tracking-normal sm:text-base">{workspace.name}</h1>
      {workspace.is_owner && !editing && <button className="btn-quiet !min-h-9 !px-2 !py-1 !text-xs" onClick={() => { setName(workspace.name); setError(''); setEditing(true) }}>Editar estudio</button>}
    </div>
    {workspaces.length > 1 && <label className="mt-3 block text-xs text-muted">Estudio activo<select aria-label="Estudio activo" className="mt-1 !min-h-9 !py-1 !text-sm" value={workspace.id} disabled={busy} onChange={(event) => { setEditing(false); onSelect(event.target.value) }}>{workspaces.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_owner ? ' · propio' : ' · compartido'}</option>)}</select></label>}
    {editing && <form className="mt-3" aria-label="Editar estudio" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError('')
      try { onRenamed(await businessApi.renameWorkspace(workspace.id, name)); setEditing(false) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el estudio.') }
      finally { setBusy(false) }
    }}>
      <label>Nombre del estudio<input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <p className="mb-3 text-xs text-muted">Es el nombre de tu negocio. Tus clientes se registran en Organizaciones o Particulares.</p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>Guardar estudio</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button></div>
    </form>}
  </div>
}
