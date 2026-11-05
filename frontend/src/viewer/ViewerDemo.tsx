import { useMemo, useState } from 'react'
import { PanoramaViewer } from './PanoramaViewer'
import { demoScenes } from './demoScenes'

export function ViewerDemo() {
  const [sceneId, setSceneId] = useState(demoScenes[0].id)
  const [mounted, setMounted] = useState(true)
  const [resolution, setResolution] = useState('auto')
  const selectedScene = demoScenes.find((item) => item.id === sceneId) ?? demoScenes[0]
  const scene = useMemo(() => resolution === 'small'
    ? { ...selectedScene, sources: selectedScene.sources.filter((source) => source.width <= 2048) }
    : selectedScene, [selectedScene, resolution])
  return (
    <main>
      <header>
        <p className="brand">Vision360 · Prueba del visor</p>
        <h1>Explorá el recorrido 360°</h1>
        <p>Dos ambientes sintéticos para probar navegación y puntos de información.</p>
      </header>
      <nav className="scene-list" aria-label="Ambientes">
        {demoScenes.map((item) => <button key={item.id} aria-pressed={item.id === sceneId}
          onClick={() => setSceneId(item.id)}>{item.name}</button>)}
      </nav>
      <label className="resolution">Resolución de prueba{' '}
        <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
          <option value="auto">Automática · hasta 4096 × 2048</option>
          <option value="small">2048 × 1024</option>
        </select>
      </label>
      <h2>{scene.name}</h2>
      {mounted ? <PanoramaViewer scene={scene} onNavigate={setSceneId} /> : <p>Visor desmontado.</p>}
      <button className="mount-button" onClick={() => setMounted(!mounted)}>
        {mounted ? 'Desmontar visor' : 'Montar visor'}
      </button>
      <p className="scope-note">Prueba técnica sin guardado de datos. Los puntos temporales se eliminan al cambiar de ambiente.</p>
    </main>
  )
}
