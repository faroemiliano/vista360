export function deliveryDocumentFilename(client: string, title: string, id: string, issuedAt: string) {
  const part = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || '360'
  const date = new Date(issuedAt)
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  return `Entrega_${part(client)}_${part(title)}_${day}_${part(id).slice(0, 8)}.pdf`
}
