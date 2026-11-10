import { t } from '../../i18n'
import { useEffect, useState } from 'react'
import { subscriptionApi } from '../../api/subscriptions'
import type { components } from '../../api/schema'
import { planRegistrationUrl, publicPlan } from '../subscriptions/selection'
import { Icon } from '../../components/Icon'

const audiences = { trial: 'Conocé el editor y prepará tu primera visita.', professional: 'Para fotógrafos que trabajan por su cuenta.', studio: 'Para negocios con una cartera más amplia.' }
function space(value: number) { return value >= 1024 ** 3 ? `${value / 1024 ** 3} GiB` : `${value / 1024 ** 2} MiB` }

export function Plans() {
  const [plans, setPlans] = useState<components['schemas']['Plan'][] | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    subscriptionApi.catalog().then(result => { if (active) setPlans(result) }).catch(() => { if (active) setError(t("No pudimos consultar los planes. Intentá nuevamente o escribinos.")) })
    return () => { active = false }
  }, [version])
  return <section id="planes" className="scroll-mt-6 py-14" aria-labelledby="planes-titulo">
    <p className="eyebrow mb-4 text-accent">{t("Tu próxima perspectiva")}</p>
    <h2 id="planes-titulo" className="text-3xl sm:text-4xl">{t("Un plan para tu estudio.")}</h2>
    <p className="mt-5 max-w-2xl text-muted">{t("Elegí cómo empezar a crear, organizar y compartir tus recorridos. Si todavía no tenés una cuenta, te acompañamos a registrarte.")}</p>
    {!plans && !error && <p role="status" className="mt-6 text-sm text-muted">{t("Consultando planes…")}</p>}
    {error && <div role="alert" className="mt-6"><p>{t(error)}</p><button className="mt-3" onClick={() => setVersion(value => value + 1)}>{t("Reintentar planes")}</button></div>}
    {plans && <div className="mt-9 grid gap-5 lg:grid-cols-3">{plans.map(plan => {
      const code = publicPlan(plan.code)
      if (!code) return null
      const featured = code === 'professional'
      return <article key={code} aria-labelledby={`plan-${code}`} className={`relative flex min-w-0 flex-col rounded-2xl border bg-surface-900 p-6 sm:p-8 ${featured ? 'border-accent/60 shadow-[0_0_35px_rgba(99,220,240,0.06)]' : 'border-line'}`}>
        <div className="flex min-h-7 items-center justify-between gap-3"><Icon name={code === 'studio' ? 'grid' : code === 'professional' ? 'camera' : 'aperture'} className="size-6 text-accent" />{featured && <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{t("Para tu actividad diaria")}</span>}</div>
        <h3 id={`plan-${code}`} className="mt-5 text-2xl">{t(plan.name)}</h3>
        <p className="mt-3 text-sm text-muted">{t(audiences[code])}</p>
        <p className="my-6 text-xl font-semibold">{plan.trial_days ? t("Gratis · {0} días", [plan.trial_days]) : t("Mensual · Precio a consultar")}</p>
        <p className="mb-4 text-xs text-accent">{code === 'trial' ? t("Activación inmediata · Sin tarjeta") : t("Pago personal · Activación por administración")}</p>
        <ul className="mb-7 space-y-3 text-sm text-muted">
          <li>{plan.published_limit} {plan.published_limit === 1 ? t("recorrido publicado") : t("recorridos publicados")}{' '}{t("a la vez")}</li>
          {plan.scene_limit !== null && <li>{t("Hasta")} {plan.scene_limit}{' '}{t("ambientes por recorrido")}</li>}
          {plan.storage_limit_bytes !== null && <li>{space(plan.storage_limit_bytes)}{' '}{t("de reserva de almacenamiento")}</li>}
          <li>{t("Editor 360° y enlaces para compartir")}</li>
          <li>{t("Gestión de clientes y trabajos")}</li>
          <li>{t("Formulario propio y código QR")}</li>
        </ul>
        <a href={planRegistrationUrl(code)} className={`${featured ? 'btn-primary' : 'border border-line bg-surface-850 text-ink hover:border-accent/50'} mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold`}>{code === 'trial' ? t("Probar gratis") : t("Elegir {0}", [t(plan.name)])}<Icon name="arrow" className="size-4" /></a>
      </article>
    })}</div>}
    <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">{t("Estamos en etapa de prueba: las cuotas son iniciales y los límites comerciales todavía no bloquean el uso. Los planes Profesional y Estudio son mensuales. Coordinás el pago personalmente con Vision360 y administración habilita el plan elegido al confirmarlo. No hay cobros ni renovación automáticos. La toma de fotografías se contrata por separado.")}</p>
  </section>
}
