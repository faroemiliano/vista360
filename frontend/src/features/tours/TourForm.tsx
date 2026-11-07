import { useState } from 'react'
import type { Tour, TourInput } from '../../api/client'
import { useBlockNavigation } from '../../app/navigation'
import { directionsUrl } from '../../lib/maps'

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '')

export function TourForm({ tour, busy, onSave }: {
  tour?: Tour; busy: boolean; onSave: (data: TourInput) => Promise<void>
}) {
  const [title, setTitle] = useState(tour?.title || '')
  const [slug, setSlug] = useState(tour?.slug || '')
  const [description, setDescription] = useState(tour?.description || '')
  const [customSlug, setCustomSlug] = useState(Boolean(tour))
  const [showLocation, setShowLocation] = useState(Boolean(tour?.public_location))
  const [locationLabel, setLocationLabel] = useState(tour?.public_location?.label || '')
  const [latitude, setLatitude] = useState(String(tour?.public_location?.latitude ?? ''))
  const [longitude, setLongitude] = useState(String(tour?.public_location?.longitude ?? ''))
  const location = showLocation ? { label: locationLabel.trim(), latitude: Number(latitude), longitude: Number(longitude) } : null
  const validLocation = location && location.label && latitude.trim() && longitude.trim()
    && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180
  const locationDirty = showLocation !== Boolean(tour?.public_location) || (showLocation && (
    locationLabel.trim() !== (tour?.public_location?.label || '') || !latitude.trim() || !longitude.trim()
    || Number(latitude) !== tour?.public_location?.latitude || Number(longitude) !== tour?.public_location?.longitude))
  useBlockNavigation(locationDirty || title !== (tour?.title || '') || slug !== (tour?.slug || '') || description !== (tour?.description || ''))
  return <form className={`grid gap-x-5 ${tour ? 'lg:grid-cols-2' : ''}`} onSubmit={(event) => { event.preventDefault(); if (showLocation && !validLocation) return; void onSave({ title, slug, description, public_location: location }) }}>
    <label>Título<input placeholder="Ej. Casa con jardín en Palermo" required maxLength={200} value={title} onChange={(event) => {
      setTitle(event.target.value); if (!customSlug) setSlug(slugify(event.target.value))
    }} /></label>
    <label>Dirección del enlace<input aria-label="Slug" placeholder="casa-con-jardin" required readOnly={tour?.slug_locked} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => { setCustomSlug(true); setSlug(event.target.value) }} /><span className="text-[11px] font-normal leading-relaxed text-subtle">{tour?.slug_locked ? 'Se conserva para que el enlace siga funcionando.' : 'Se genera con el título. Usá letras, números y guiones.'}</span></label>
    <label className={tour ? 'lg:col-span-2' : ''}>Descripción<textarea placeholder="¿Qué hace especial a este espacio?" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    {tour && <fieldset className="mb-5 rounded-xl border border-line p-4 lg:col-span-2">
      <legend className="px-2 text-sm font-semibold">Ubicación para visitantes</legend>
      <label className="flex items-center gap-3"><input type="checkbox" checked={showLocation} onChange={event => setShowLocation(event.target.checked)} />Mostrar cómo llegar en el recorrido público</label>
      <p className="field-hint">Es opcional. Estos datos serán públicos al publicar los cambios. La dirección interna del cliente no se utiliza.</p>
      {showLocation && <div className="mt-4 grid gap-x-5 sm:grid-cols-2">
        <label className="sm:col-span-2">Nombre o dirección pública<input required maxLength={300} value={locationLabel} onChange={event => setLocationLabel(event.target.value)} placeholder="Ej. Entrada principal, Av. Corrientes 1234, Buenos Aires" /></label>
        <label>Latitud<input required type="number" min={-90} max={90} step="any" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="Ej. -34.6037" /></label>
        <label>Longitud<input required type="number" min={-180} max={180} step="any" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="Ej. -58.3816" /></label>
        <p className="field-hint sm:col-span-2">En Google Maps, hacé clic derecho sobre la entrada exacta del lugar y copiá las coordenadas: primero latitud y después longitud. En el celular, mantené pulsado el punto para colocar un pin.</p>
        {validLocation && <a className="mb-3 text-sm text-accent underline sm:col-span-2" href={directionsUrl(location!)} target="_blank" rel="noopener noreferrer">Comprobar destino en Google Maps</a>}
      </div>}
    </fieldset>}
    <div className={tour ? 'lg:col-span-2' : ''}><button className={`btn-primary ${tour ? '' : 'w-full'}`} disabled={busy}>{busy ? 'Guardando…' : tour ? 'Guardar información' : 'Crear recorrido'}</button></div>
  </form>
}
