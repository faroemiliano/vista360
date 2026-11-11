import { t } from '../i18n'

export function FloatingWhatsApp() {
  return <a href={`https://wa.me/5491170612602?text=${encodeURIComponent(t('Hola Emiliano, quiero saber más sobre Vision360.'))}`} target="_blank" rel="noopener noreferrer" aria-label={t("Consultar a Emiliano por WhatsApp")} title={t("Consultar a Emiliano por WhatsApp")} className="fixed right-4 z-40 inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] p-0 text-white shadow-lg transition-colors hover:bg-[#1fbd5a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:right-6 print:hidden" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.7a8.5 8.5 0 1 1 16.3-3.8Z" /><path d="m8.2 7.3 1.4 2.4-1 1.1a9 9 0 0 0 4.6 4l1-1.1 2.5 1.1c-.2 2-2.2 2.1-3.6 1.4-3.1-1.5-5.6-4-6-6-.3-1.5.1-2.5 1.1-2.9Z" /></svg>
  </a>
}
