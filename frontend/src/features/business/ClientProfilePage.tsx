import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import { ApiError } from '../../api/client'
import type { Organization } from '../../api/business'
import { t } from '../../i18n'
import { ClientProfile } from './ClientProfile'

export function ClientProfilePage({ workspaceId, id, onClose, onExpired }: {
  workspaceId: string; id: string; onClose: () => void; onExpired: () => void
}) {
  const [client, setClient] = useState<Organization | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    businessApi.organizations(true, workspaceId).then(rows => {
      if (!active) return
      const found = rows.find(row => row.id === id)
      if (found) setClient(found)
      else setError(t('Cliente no encontrado en este estudio.'))
    }).catch((cause: Error) => {
      if (!active) return
      setError(cause.message)
      if (cause instanceof ApiError && cause.status === 401) onExpired()
    })
    return () => { active = false }
  }, [workspaceId, id])
  if (error) return <section><p role="alert">{t(error)}</p><button onClick={onClose}>{t('Volver a la lista')}</button></section>
  if (!client) return <p role="status">{t('Consultando clientes…')}</p>
  return <ClientProfile client={client} onSaved={setClient} onClose={onClose} />
}
