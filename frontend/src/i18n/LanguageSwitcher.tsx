import { useState } from 'react'
import { setLanguage, t, useLanguage } from './index'
import type { Language } from './index'

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const language = useLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="min-w-0 shrink-0">
    <label className="!m-0 !gap-1 text-xs"><span className={compact ? 'sr-only' : undefined}>Idioma</span>
      <select aria-label="Idioma" className="!m-0 !min-h-10 !w-auto !max-w-full !py-1 !text-xs" value={language} disabled={busy} onChange={event => {
        const next = event.target.value as Language
        setBusy(true); setError('')
        void setLanguage(next).catch(() => setError(t('No se pudo cargar el idioma. Intentá nuevamente.'))).finally(() => setBusy(false))
      }}>
        <option value="es" lang="es">Español</option><option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
      </select>
    </label>
    {error && <p role="alert" className="mt-1 text-xs">{error}</p>}
  </div>
}
