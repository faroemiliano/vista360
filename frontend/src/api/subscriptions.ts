import { request } from './client'
import type { components } from './schema'
export type Subscription = components['schemas']['SubscriptionView']
export type PlanCode = components['schemas']['Plan']['code']
export type SubscriptionEvent = components['schemas']['EventView']
export const subscriptionApi = {
  catalog: () => request<components['schemas']['Plan'][]>('/public/plans', 'GET', undefined, 'omit'),
  own: (workspace: string) => request<Subscription>(`/workspaces/${workspace}/subscription`),
  account: (user: string) => request<Subscription>(`/admin/accounts/${user}/subscription`),
  assign: (user: string, data: components['schemas']['Assignment']) => request<Subscription>(`/admin/accounts/${user}/subscription`, 'PUT', data),
  cancel: (user: string, data: components['schemas']['Cancellation']) => request<Subscription>(`/admin/accounts/${user}/subscription/cancel`, 'POST', data),
  events: (user: string) => request<SubscriptionEvent[]>(`/admin/accounts/${user}/subscription/events`),
}
