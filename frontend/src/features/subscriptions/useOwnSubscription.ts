import { useEffect, useState } from 'react'
import { subscriptionApi, type Subscription } from '../../api/subscriptions'

export function useOwnSubscription(workspaceId: string | undefined, refreshKey: string) {
  const [data, setData] = useState<Subscription | null>(null)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!workspaceId) return
    let active = true
    let loading = false
    setError(false)
    const load = async () => {
      if (loading || document.visibilityState !== 'visible') return
      loading = true
      try {
        const result = await subscriptionApi.own(workspaceId)
        if (active) { setData(result); setError(false) }
      } catch { if (active) setError(true) }
      finally { loading = false }
    }
    void load()
    const interval = window.setInterval(load, 15_000)
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', load)
    return () => {
      active = false; window.clearInterval(interval)
      window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load)
    }
  }, [workspaceId, refreshKey, version])
  return { data: data?.workspace_id === workspaceId ? data : null, error, retry: () => setVersion(value => value + 1) }
}
