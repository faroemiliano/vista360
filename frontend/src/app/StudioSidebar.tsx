import { t } from '../i18n'
import { BrandMark } from '../components/BrandMark'
import { Icon } from '../components/Icon'
import { StudioLink } from './StudioLink'
import type { StudioRoute } from './routes'

export function StudioSidebar({ route, signedIn, staff, owner, organizationId, open, onToggle }: {
  route: StudioRoute; signedIn: boolean; staff: boolean; owner: boolean; organizationId: string; open: boolean; onToggle: () => void
}) {
  const active = route.view === 'organizations' ? route.group === 'individuals' ? 'individuals' : 'organizations' : route.view
  const links = [
    { id: 'jobs', label: t('Trabajos'), icon: 'camera', to: { view: 'jobs', organizationId } },
    ...(signedIn ? [
      { id: 'organizations', label: t('Organizaciones'), icon: 'globe', to: { view: 'organizations', group: 'companies' } },
      { id: 'individuals', label: t('Particulares'), icon: 'camera', to: { view: 'organizations', group: 'individuals' } },
      ...(owner || staff ? [{ id: 'requests', label: t('Solicitudes web'), icon: 'image', to: { view: 'requests' } }] : []),
      { id: 'clients', label: t('Clientes'), aria: t('Gestionar clientes'), icon: 'link', to: { view: 'clients' } },
    ] : []),
    ...(staff ? [
      { id: 'accounts', label: t('Usuarios registrados'), icon: 'grid', to: { view: 'accounts' } },
      { id: 'contacts', label: t('Consultas del sistema'), icon: 'link', to: { view: 'contacts' } },
    ] : []),
  ] as { id: string; label: string; aria?: string; icon: Parameters<typeof Icon>[0]['name']; to: Partial<StudioRoute> }[]
  return <aside className="studio-sidebar flex flex-col bg-canvas px-5 py-5 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:px-6 lg:py-8">
    <div className="flex items-center justify-between gap-3">
      <a href="/inicio" className="flex items-center gap-3 text-xl font-bold tracking-tight"><BrandMark className="size-10 shrink-0" />Vision360</a>
      <button className="!border-line !bg-transparent !px-3 lg:!hidden" aria-label={open ? t('Cerrar menú') : t('Abrir menú')} aria-expanded={open} aria-controls="studio-navigation" onClick={onToggle}><Icon name="grid" className="size-4" /><span className="text-xs">{t('Menú')}</span></button>
    </div>
    <nav id="studio-navigation" aria-label={t('Navegación principal')} className={`${open ? 'block' : 'hidden'} mt-6 lg:mt-10 lg:block`}>
      <p className="mb-3 text-[10px] font-semibold tracking-[.2em] text-subtle">{t('TU ESPACIO')}</p>
      {links.map(link => <div key={link.id}>
        {link.id === 'accounts' && <p className="mb-3 mt-7 text-[10px] font-semibold tracking-[.2em] text-subtle">{t('ADMINISTRACIÓN')}</p>}
        <StudioLink reset to={link.to} aria-label={link.aria} aria-current={active === link.id ? 'page' : undefined}
          className={`mt-2 inline-flex min-h-11 w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active === link.id ? 'bg-accent/12 text-accent' : 'text-white/70 hover:bg-accent/5'}`}><Icon name={link.icon} />{link.label}</StudioLink>
      </div>)}
    </nav>
    <div className="mt-auto hidden pt-10 lg:block">
      <div className="rounded-2xl border border-white/10 bg-surface-900/5 p-4"><Icon name="image" className="mb-3 size-6 text-accent" /><p className="text-sm font-semibold">{t('Un espacio. Otra perspectiva.')}</p><p className="mt-2 text-xs leading-relaxed text-muted">{t('Convertí tus fotos 360° en una visita que se puede recorrer.')}</p></div>
      <a href="/visor" className="mt-5 flex items-center gap-2 text-xs text-subtle hover:text-white"><Icon name="eye" className="size-4" />{t('Abrir prueba del visor 360°')}</a>
    </div>
  </aside>
}
