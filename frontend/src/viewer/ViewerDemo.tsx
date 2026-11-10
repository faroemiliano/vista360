import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { t, useLanguage } from '../i18n'
import { useMemo, useState } from 'react'
import { PanoramaViewer } from './PanoramaViewer'
import { demoScenes } from './demoScenes'

export function ViewerDemo() {
  const language = useLanguage()
  const [sceneId, setSceneId] = useState(demoScenes[0].id)
  const [mounted, setMounted] = useState(true)
  const [resolution, setResolution] = useState('auto')
  const localizedScenes = useMemo(() => demoScenes.map(scene => ({ ...scene, name: t(scene.name), hotspots: scene.hotspots.map(point => ({ ...point, label: t(point.label), ...(point.type === 'info' ? { text: t(point.text) } : {}) })) })), [language])
  const selectedScene = localizedScenes.find((item) => item.id === sceneId) ?? localizedScenes[0]
  const scene = useMemo(() => resolution === 'small'
    ? { ...selectedScene, sources: selectedScene.sources.filter((source) => source.width <= 2048) }
    : selectedScene, [selectedScene, resolution])
  return (
    <main>
      <header><LanguageSwitcher />
        <p className="brand">{t("Vision360 · Prueba del visor")}</p>
        <h1>{t("Explorá el recorrido 360°")}</h1>
        <p>{t("Dos ambientes sintéticos para probar navegación y puntos de información.")}</p>
      </header>
      <nav className="scene-list" aria-label={t("Ambientes")}>
        {localizedScenes.map((item) => <button key={item.id} aria-pressed={item.id === sceneId}
          onClick={() => setSceneId(item.id)}>{item.name}</button>)}
      </nav>
      <label className="resolution">{t("Resolución de prueba")}{' '}
        <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
          <option value="auto">{t("Automática · hasta 4096 × 2048")}</option>
          <option value="small">2048 × 1024</option>
        </select>
      </label>
      <h2>{scene.name}</h2>
      {mounted ? <PanoramaViewer scene={scene} onNavigate={setSceneId} /> : <p>{t("Visor desmontado.")}</p>}
      <button className="mount-button" onClick={() => setMounted(!mounted)}>
        {mounted ? t("Desmontar visor") : t("Montar visor")}
      </button>
      <p className="scope-note">{t("Prueba técnica sin guardado de datos. Los puntos temporales se eliminan al cambiar de ambiente.")}</p>
    </main>
  )
}
