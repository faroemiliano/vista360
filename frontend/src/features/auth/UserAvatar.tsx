import { t } from '../../i18n'
import { useState } from 'react'
import { apiResourceUrl } from '../../api/client'
import type { User } from '../../api/client'

export function UserAvatar({ user, className = 'size-10' }: { user: User; className?: string }) {
  const [failed, setFailed] = useState('')
  const source = user.avatar_url ? apiResourceUrl(user.avatar_url) : ''
  const initials = (user.display_name || user.email_normalized).split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/10 font-bold text-accent ${className}`}>
    {source && source !== failed ? <img src={source} alt={t("Foto de perfil")} className="size-full object-cover" onError={() => setFailed(source)} /> : <span aria-hidden="true">{initials}</span>}
  </span>
}
