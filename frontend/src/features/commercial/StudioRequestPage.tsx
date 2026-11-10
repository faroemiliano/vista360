import { LanguageSwitcher } from '../../i18n/LanguageSwitcher'
import { t, useLanguage } from '../../i18n'
import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import { BrandMark } from '../../components/BrandMark'
import { ServiceForm } from './ServiceForm'

export function StudioRequestPage({ token }: { token: string }) {
  const language = useLanguage()
  const [studio, setStudio] = useState<{ name: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    businessApi.publicStudio(token).then((value) => {
      if (active) setStudio(value)
    }).catch(() => { if (active) setError(t("Este formulario no está disponible. Pedile un enlace actualizado al fotógrafo.")) })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    if (studio) document.title = t('Solicitar fotografía · {0}', [studio.name])
  }, [studio, language])
  return <div className="commercial-page min-h-screen">
    <header className="commercial-header flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8"><LanguageSwitcher /><a href="/inicio" className="mx-auto flex max-w-5xl items-center gap-3 font-semibold"><BrandMark dynamic />Vision360</a></header>
    <main className="!max-w-5xl !py-12 sm:!py-16">
      {error ? <p role="alert">{t(error)}</p> : !studio ? <p role="status">{t("Abriendo el formulario del estudio…")}</p> : <div className="grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr]">
        <div><p className="eyebrow mb-4 text-accent">{t("Solicitud de fotografía 360°")}</p><h1 className="break-words text-4xl">{studio.name}</h1>
          <p className="mt-6 text-muted">{t("Contanos qué espacio querés mostrar. Tu consulta llegará directamente a este estudio para coordinar la visita y el presupuesto.")}</p>
          <p className="mt-5 text-sm text-muted">{t("No necesitás una cuenta ni realizar un pago. El estudio te contactará con los datos que dejes.")}</p>
          <div className="mt-8 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm">{t("Estás consultando a")} <strong>{studio.name}</strong>.</div>
        </div>
        <ServiceForm studioToken={token} studioName={studio.name} />
      </div>}
    </main>
  </div>
}
