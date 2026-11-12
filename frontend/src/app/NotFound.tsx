import { t } from '../i18n'
import { StudioLink } from './StudioLink'

export function NotFound({ studio = false }: { studio?: boolean }) {
  return <section className="card mx-auto max-w-xl p-7" aria-label={t('Página no encontrada')}>
    <p className="eyebrow">404</p><h1 className="mt-3 text-2xl">{t('Página no encontrada')}</h1>
    <p className="muted my-4">{t('La dirección no corresponde a una página de Vision360. Revisá el enlace o volvé al inicio.')}</p>
    {studio ? <StudioLink reset to={{ view: 'jobs' }} className="btn-primary inline-flex rounded-xl px-4 py-3">{t('Volver a trabajos')}</StudioLink>
      : <a href="/inicio" className="btn-primary inline-flex rounded-xl px-4 py-3">{t('Volver al inicio')}</a>}
  </section>
}
