import { Icon } from '../../components/Icon'

const email = 'farixio.tech@gmail.com'
const contactUrl = `mailto:${email}?subject=${encodeURIComponent('Consulta sobre Vision360')}`

export function PlatformContact() {
  return <aside className="mt-6 border-t border-line pt-6" aria-label="Contacto con el creador de Vision360">
    <div className="flex items-start gap-3">
      <span className="mt-1 text-accent"><Icon name="help" /></span>
      <div className="min-w-0">
        <h3 className="text-base">¿Querés conocer Vision360 antes de empezar?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">Soy Emiliano, creador de Vision360. Escribime para conocer cómo funciona el sistema, cómo usarlo en tu trabajo o resolver tus dudas sobre seguridad. No necesitás una cuenta para consultar.</p>
        <a href={contactUrl} className="mt-3 inline-flex min-h-11 max-w-full items-center break-all text-sm font-semibold text-accent underline underline-offset-4">{email}</a>
        <p className="text-xs text-subtle">El enlace abre tu aplicación de correo para escribirme directamente.</p>
      </div>
    </div>
    <details className="mt-5 rounded-xl border border-line bg-canvas/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Cómo protegemos tu cuenta y tus datos</summary>
      <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
        <li><strong className="text-ink">Contraseñas protegidas.</strong> No se guardan en texto legible.</li>
        <li><strong className="text-ink">Acceso según permisos.</strong> Los clientes y trabajos de tu estudio se consultan con una cuenta autorizada. Las consultas de tu formulario las gestiona el titular del estudio.</li>
        <li><strong className="text-ink">Publicación bajo tu control.</strong> Los recorridos se comparten al publicarlos. Los datos de contacto y las notas internas de tus trabajos no se muestran en la visita pública.</li>
      </ul>
    </details>
  </aside>
}
