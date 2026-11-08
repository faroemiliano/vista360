import { useEffect } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { CaptureVisual } from '../../components/CaptureVisual'
import { Icon } from '../../components/Icon'

const steps = [
  { title: 'Capturá', text: 'Tomá panorámicas completas de cada espacio.', icon: 'camera' as const },
  { title: 'Revelá el espacio', text: 'Cargá una foto 360° por ambiente en el estudio.', icon: 'image' as const },
  { title: 'Conectá', text: 'Uní los ambientes y sumá puntos de información.', icon: 'link' as const },
  { title: 'Compartí', text: 'Revisá, publicá y entregá una nueva forma de visitar.', icon: 'globe' as const },
]

export function Landing() {
  useEffect(() => { document.title = 'Vision360 — Recorridos virtuales para espacios reales' }, [])
  return <div className="commercial-page min-h-screen">
    <a href="#contenido" className="sr-only focus:not-sr-only focus:block focus:p-4">Ir al contenido</a>
    <header className="commercial-header">
      <nav aria-label="Navegación comercial" className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-5 sm:gap-6 sm:px-8">
        <a href="/inicio" className="home-brand mr-auto flex items-center gap-3 text-xl font-bold tracking-tight text-ink"><BrandMark dynamic />Vision360</a>
        <a href="#como-funciona" className="text-sm text-muted">Cómo funciona</a>
        <a href="/studio" className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold">Ingresar al estudio<Icon name="arrow" className="size-4" /></a>
      </nav>
    </header>
    <main id="contenido" className="max-w-7xl !py-0">
      <section className="landing-hero grid items-center gap-12 py-14 lg:grid-cols-[1.12fr_1fr] lg:gap-14 lg:py-20">
        <div>
          <p className="hero-kicker mb-7">Fotografía · Espacios · Experiencias</p>
          <h1 className="max-w-2xl text-[2.7rem] leading-[1.06] tracking-[-.055em] sm:text-6xl lg:text-[4.2rem]">Transformamos espacios reales en <span className="hero-gradient">experiencias virtuales.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg">Creá recorridos 360° interactivos, digitalizá propiedades y mostrale cada ambiente a tus clientes desde cualquier dispositivo.</p>
          <div className="my-7 flex flex-wrap gap-3">
            <a className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold" href="/studio">Crear mi recorrido<Icon name="arrow" className="size-4" /></a>
            <a className="inline-flex items-center rounded-xl border border-line bg-surface-900 px-5 py-3.5 text-sm font-semibold text-ink hover:border-accent/50" href="#como-funciona">Ver cómo funciona</a>
          </div>
          <div className="hero-footnote"><Icon name="focus" className="mt-0.5 size-5 shrink-0 text-accent" /><p className="max-w-sm text-xs leading-relaxed text-muted">Cada perspectiva cuenta. Recorridos panorámicos interactivos a partir de fotos 360°; sin reconstrucción 3D.</p></div>
        </div>
        <CaptureVisual />
      </section>
      <section id="como-funciona" className="scroll-mt-6 py-12">
        <p className="eyebrow section-heading mb-4">Del espacio al enlace</p><h2 className="text-3xl sm:text-4xl">Así se construye una visita.</h2>
        <ol className="mt-10 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step, index) => <li key={step.title} className="border-t border-line pt-5"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-sm text-accent">0{index + 1} /</span><Icon name={step.icon} className="size-5 text-subtle" /></div><h3>{step.title}</h3><p className="muted mt-3">{step.text}</p></li>)}</ol>
        <p className="muted mt-8 max-w-3xl">Compatible con JPEG equirectangular completo 2:1 exportado desde celulares, Insta360 o Ricoh Theta. La captura guiada y el stitching desde el teléfono todavía no están disponibles.</p>
      </section>
      <section className="audience-panel my-10 overflow-hidden rounded-2xl p-6 sm:p-10">
        <div className="flex items-start gap-6"><Icon name="focus" className="hidden size-14 shrink-0 text-violet sm:block" /><div><p className="eyebrow text-violet">Para quienes necesitan mostrar un espacio</p><h2 className="mt-4 max-w-3xl text-3xl sm:text-4xl">Lugares que merecen<br />otra forma de ser vistos.</h2></div></div>
        <ul className="mt-8 flex flex-wrap gap-2">{['Inmobiliarias', 'Fotógrafos', 'Hoteles y alojamientos', 'Arquitectos', 'Constructoras', 'Comercios y locales', 'Empresas'].map((name) => <li key={name} className="rounded-full border border-line bg-canvas/35 px-4 py-2 text-sm text-muted">{name}</li>)}</ul>
      </section>
    </main>
    <footer className="border-t border-line/60 px-5 py-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5"><a href="/inicio" className="home-brand flex items-center gap-3 text-sm font-semibold"><BrandMark dynamic className="size-8" />Vision360</a><span className="text-xs text-muted">Espacios reales, experiencias virtuales.</span><a href="/studio" className="text-xs text-accent">Ingresar al estudio →</a></div></footer>
  </div>
}
