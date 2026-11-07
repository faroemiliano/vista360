import { useEffect, useState } from 'react'

export function RequestQr({ link, studioName }: { link: string; studioName: string }) {
  const [result, setResult] = useState<{ link: string; image?: string; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null)
    void import('qrcode').then(({ toDataURL }) => toDataURL(link, {
      errorCorrectionLevel: 'M', width: 768, margin: 4,
      color: { dark: '#000000ff', light: '#ffffffff' },
    })).then((image) => { if (active) setResult({ link, image }) })
      .catch(() => { if (active) setResult({ link, failed: true }) })
    return () => { active = false }
  }, [link, attempt])
  const image = result?.link === link ? result.image : undefined
  const filename = studioName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'estudio'
  return <div className="my-5 flex flex-col items-center gap-5 rounded-xl border border-accent/20 bg-accent/5 p-5 sm:flex-row sm:items-center">
    <div className="flex size-48 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-2">
      {image ? <img src={image} width={768} height={768} className="size-full" alt={`Código QR para solicitar fotografías a ${studioName}`} />
        : <span className="px-3 text-center text-sm text-slate-700">{result?.failed ? 'No se pudo generar el QR.' : 'Generando tu QR…'}</span>}
    </div>
    <div className="min-w-0 text-center sm:text-left"><h3>Tu QR para recibir consultas</h3>
      <p className="muted mb-4 mt-2">Al escanearlo, tus clientes abren el formulario de {studioName} sin registrarse. Podés compartirlo o imprimirlo.</p>
      {image && <a href={image} download={`vision360-qr-${filename}.png`} className="btn-primary inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold">Descargar QR</a>}
      {result?.failed && <button onClick={() => setAttempt((value) => value + 1)}>Volver a generar QR</button>}
    </div>
  </div>
}
