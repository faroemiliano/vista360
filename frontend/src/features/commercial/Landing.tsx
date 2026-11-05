import { useEffect } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { CaptureVisual } from '../../components/CaptureVisual'
import { Icon } from '../../components/Icon'
import { ServiceForm } from './ServiceForm'

const solutions = [
  { name: 'Vision360 Studio', icon: 'camera' as const, title: 'Nosotros digitalizamos tu espacio.', text: 'Coordinamos la captura, fotografiamos cada perspectiva y preparamos un recorrido listo para compartir.', href: '#solicitud', action: 'Solicitar servicio' },
  { name: 'Vision360 Platform', icon: 'aperture' as const, title: 'Tu mirada. Tus propios recorridos.', text: 'Un estudio para tus panorámicas: organizá ambientes, conectá espacios y publicá la visita desde un mismo lugar.', href: '/studio', action: 'Abrir el estudio' },
  { name: 'Vision360 Network', icon: 'link' as const, title: 'Una red de profesionales.', text: 'Estamos preparando el encuentro entre inmobiliarias y fotógrafos. La contratación entre terceros todavía no está disponible.', href: '', action: '' },
]
const steps = [
  { title: 'Capturá', text: 'Tomá panorámicas completas o solicitá nuestro servicio.', icon: 'camera' as const },
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
        <a href="/inicio" className="mr-auto flex items-center gap-3 text-xl font-bold tracking-tight text-ink"><BrandMark />Vision360</a>
        <a href="#soluciones" className="text-sm text-muted">Soluciones</a>
        <a href="#como-funciona" className="text-sm text-muted">Cómo funciona</a>
        <a href="#planes" className="text-sm text-muted">Planes</a>
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
            <a className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold" href="#solicitud">Solicitar recorrido 360°<Icon name="arrow" className="size-4" /></a>
            <a className="inline-flex items-center rounded-xl border border-line bg-surface-900 px-5 py-3.5 text-sm font-semibold text-ink hover:border-accent/50" href="/studio">Crear mi recorrido</a>
          </div>
          <a className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4" href="/visor"><Icon name="eye" className="size-4" />Ver demostración técnica</a>
          <div className="hero-footnote"><Icon name="focus" className="mt-0.5 size-5 shrink-0 text-accent" /><p className="max-w-sm text-xs leading-relaxed text-muted">Cada perspectiva cuenta. Recorridos panorámicos interactivos a partir de fotos 360°; sin reconstrucción 3D.</p></div>
        </div>
        <CaptureVisual />
      </section>
      <section id="soluciones" className="scroll-mt-6 border-t border-line/60 py-14 sm:py-20">
        <p className="eyebrow section-heading mb-4">Elegí cómo trabajar</p>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><h2 className="max-w-xl text-3xl sm:text-4xl">Tres caminos.<br /><span className="text-muted">Un mismo espacio.</span></h2><p className="max-w-xs text-sm text-muted">Desde la primera captura hasta el enlace que recibe tu cliente.</p></div>
        <div className="grid gap-5 md:grid-cols-3">{solutions.map((item, index) => <article key={item.name} className={`solution-card card flex flex-col p-6 ${index === 0 ? '!border-accent/35' : ''}`}>
          <div className="mb-8 flex items-center justify-between"><span className="solution-icon"><Icon name={item.icon} className="size-6" /></span><span className="font-mono text-xs text-subtle">0{index + 1}</span></div>
          <p className="eyebrow text-accent">{item.name}</p>
          {!item.href && <span className="badge mt-3 self-start !border-violet/25 !text-violet">Próximamente</span>}
          <h3 className="mt-4 text-xl">{item.title}</h3><p className="muted mb-7 mt-3">{item.text}</p>
          {item.href && <a href={item.href} className="mt-auto inline-flex items-center gap-2 border-t border-line pt-5 text-sm font-semibold text-accent">{item.action}<Icon name="arrow" className="size-4" /></a>}
        </article>)}</div>
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
      <section id="demostraciones" className="py-12">
        <p className="eyebrow section-heading mb-4">Explorá el formato</p><h2 className="text-3xl sm:text-4xl">Demostraciones</h2>
        <div className="card mt-7 grid items-center gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8"><span className="solution-icon !size-16"><Icon name="aperture" className="size-9" /></span><div><h3>Conocé los controles del visor</h3><p className="muted mt-3 max-w-2xl">La demostración actual usa grillas sintéticas para probar giro, zoom y navegación. Todavía no exhibimos propiedades o trabajos de clientes en esta página.</p><a href="/visor" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent">Probar visor 360°<Icon name="arrow" className="size-4" /></a></div></div>
      </section>
      <section id="planes" className="scroll-mt-6 py-12">
        <p className="eyebrow section-heading mb-4">Una solución para cada forma de trabajar</p><h2 className="text-3xl sm:text-4xl">Servicios y futuros planes</h2><p className="muted mt-4 max-w-2xl">El servicio se evalúa por propiedad. Los planes de suscripción están en preparación: sin precios definitivos ni contratación online.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{['Gratis limitado', 'Profesional / fotógrafo', 'Inmobiliaria', 'Empresa'].map((name) => <article key={name} className="card p-5"><span className="badge mb-5">Estructura en preparación</span><h3>{name}</h3><p className="muted my-4">Alcance y límites comerciales sujetos a definición.</p><a href="#solicitud" className="text-sm font-semibold text-accent underline underline-offset-4">Consultar opciones</a></article>)}</div>
      </section>
      <section id="solicitud" className="grid scroll-mt-6 items-start gap-10 border-t border-line/60 py-16 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
        <div><span className="solution-icon mb-6"><Icon name="camera" className="size-6" /></span><p className="eyebrow mb-4 text-accent">Vision360 Studio</p><h2 className="text-3xl sm:text-4xl">Tu espacio puede ser<br /><span className="hero-gradient">la próxima visita.</span></h2><p className="muted mt-5 max-w-md">Contanos qué necesitás digitalizar. Usaremos tus datos para evaluar el trabajo y coordinar el contacto; la fecha y el presupuesto se acuerdan después.</p><p className="mt-5 max-w-md text-xs leading-relaxed text-muted">Si ya tenés fotos panorámicas completas, podés usar el editor. El formulario no inicia una contratación ni un cobro.</p><a href="/studio" className="mt-6 inline-block text-sm font-semibold text-accent underline underline-offset-4">Ya tengo fotos, quiero crear mi recorrido →</a></div>
        <ServiceForm />
      </section>
    </main>
    <footer className="border-t border-line/60 px-5 py-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5"><a href="/inicio" className="flex items-center gap-3 text-sm font-semibold"><BrandMark className="size-8" />Vision360</a><span className="text-xs text-muted">Espacios reales, experiencias virtuales.</span><a href="/studio" className="text-xs text-accent">Ingresar al estudio →</a></div></footer>
  </div>
}
