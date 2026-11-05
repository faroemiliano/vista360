import { useState } from 'react'
import type { Tour, TourInput } from '../../api/client'
import { useBlockNavigation } from '../../app/navigation'

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '')

export function TourForm({ tour, busy, onSave }: {
  tour?: Tour; busy: boolean; onSave: (data: TourInput) => Promise<void>
}) {
  const [title, setTitle] = useState(tour?.title || '')
  const [slug, setSlug] = useState(tour?.slug || '')
  const [description, setDescription] = useState(tour?.description || '')
  const [customSlug, setCustomSlug] = useState(Boolean(tour))
  useBlockNavigation(title !== (tour?.title || '') || slug !== (tour?.slug || '') || description !== (tour?.description || ''))
  return <form className={`grid gap-x-5 ${tour ? 'lg:grid-cols-2' : ''}`} onSubmit={(event) => { event.preventDefault(); void onSave({ title, slug, description }) }}>
    <label>Título<input placeholder="Ej. Casa con jardín en Palermo" required maxLength={200} value={title} onChange={(event) => {
      setTitle(event.target.value); if (!customSlug) setSlug(slugify(event.target.value))
    }} /></label>
    <label>Dirección del enlace<input aria-label="Slug" placeholder="casa-con-jardin" required readOnly={tour?.slug_locked} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => { setCustomSlug(true); setSlug(event.target.value) }} /><span className="text-[11px] font-normal leading-relaxed text-subtle">{tour?.slug_locked ? 'Se conserva para que el enlace siga funcionando.' : 'Se genera con el título. Usá letras, números y guiones.'}</span></label>
    <label className={tour ? 'lg:col-span-2' : ''}>Descripción<textarea placeholder="¿Qué hace especial a este espacio?" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <div className={tour ? 'lg:col-span-2' : ''}><button className={`btn-primary ${tour ? '' : 'w-full'}`} disabled={busy}>{busy ? 'Guardando…' : tour ? 'Guardar información' : 'Crear recorrido'}</button></div>
  </form>
}
