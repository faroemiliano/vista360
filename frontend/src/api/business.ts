import { apiResourceUrl, getSession, request } from './client'
import type { components } from './schema'

export type Organization = components['schemas']['OrganizationResponse']
export type Property = components['schemas']['PropertyResponse']
export type Client = components['schemas']['ClientResponse']
export type Member = components['schemas']['MemberResponse']
export type ServiceJob = components['schemas']['ServiceResponse']
export type WorkJob = components['schemas']['WorkResponse']
export type BusinessWorkspace = components['schemas']['WorkspaceResponse']
const inbox = (workspaceId?: string) => workspaceId ? `/workspaces/${workspaceId}/service-requests` : '/admin/service-requests'
export const businessApi = {
  platformContacts: (q: string, offset: number) => request<components['schemas']['PlatformInbox']>(
    `/admin/platform-contacts?${new URLSearchParams({ q, offset: String(offset), limit: '50' })}`),
  registeredAccounts: (q: string, kind: 'all' | 'individual' | 'company', offset: number) => {
    const params = new URLSearchParams({ q, kind, offset: String(offset), limit: '50' })
    return request<components['schemas']['AccountDirectory']>(`/admin/accounts?${params}`)
  },
  requestPage: (id: string, enabled: boolean) => request<BusinessWorkspace>(`/workspaces/${id}/request-page`, 'PUT', { enabled }),
  publicStudio: (token: string) => request<components['schemas']['PublicStudio']>(`/public/studios/${token}`),
  workspaces: () => request<BusinessWorkspace[]>('/workspaces'),
  renameWorkspace: (id: string, name: string) => request<BusinessWorkspace>(`/workspaces/${id}`, 'PUT', { name }),
  access: () => request<components['schemas']['AccessResponse']>('/business/access'),
  organizations: (includeDeleted = false, workspaceId?: string) => {
    const query = new URLSearchParams()
    if (includeDeleted) query.set('include_deleted', 'true')
    if (workspaceId) query.set('workspace_id', workspaceId)
    return request<Organization[]>(`/organizations${query.size ? `?${query}` : ''}`)
  },
  deleteOrganization: (id: string) => request<void>(`/organizations/${id}`, 'DELETE'),
  createOrganization: (data: components['schemas']['OrganizationInput']) => request<Organization>('/organizations', 'POST', data),
  updateOrganization: (id: string, data: components['schemas']['OrganizationDetails']) => request<Organization>(`/organizations/${id}`, 'PUT', data),
  properties: (id: string) => request<Property[]>(`/organizations/${id}/properties`),
  createProperty: (id: string, data: components['schemas']['PropertyInput']) => request<Property>(`/organizations/${id}/properties`, 'POST', data),
  updateProperty: (id: string, property: string, data: components['schemas']['PropertyInput']) => request<Property>(`/organizations/${id}/properties/${property}`, 'PUT', data),
  clients: (id: string) => request<Client[]>(`/organizations/${id}/clients`),
  createClient: (id: string, data: components['schemas']['ClientInput']) => request<Client>(`/organizations/${id}/clients`, 'POST', data),
  updateClient: (id: string, client: string, data: components['schemas']['ClientInput']) => request<Client>(`/organizations/${id}/clients/${client}`, 'PUT', data),
  deleteClient: (id: string, client: string) => request<void>(`/organizations/${id}/clients/${client}`, 'DELETE'),
  members: (id: string) => request<Member[]>(`/organizations/${id}/members`),
  setMember: (id: string, data: components['schemas']['MemberInput']) => request<Member>(`/organizations/${id}/members`, 'PUT', data),
  removeMember: (id: string, user: string) => request<void>(`/organizations/${id}/members/${user}`, 'DELETE'),
  tours: (id: string) => request<components['schemas']['TourResponse'][]>(`/organizations/${id}/tours`),
  createTour: (id: string, data: components['schemas']['OrganizationTourInput']) => request<components['schemas']['TourResponse']>(`/organizations/${id}/tours`, 'POST', data),
  submitService: async (data: components['schemas']['ServiceInput'], studioToken?: string) => {
    await getSession()
    return request<components['schemas']['ServiceReceipt']>(studioToken ? `/public/studios/${studioToken}/service-requests` : '/service-requests', 'POST', data)
  },
  jobs: (offset: number, workspaceId?: string) => request<ServiceJob[]>(`${inbox(workspaceId)}?offset=${offset}&limit=50`),
  serviceRequest: (id: string, workspaceId?: string) => request<ServiceJob>(`${inbox(workspaceId)}/${id}`),
  transition: (id: string, data: components['schemas']['TransitionInput'], workspaceId?: string) => request<ServiceJob>(`${inbox(workspaceId)}/${id}/status`, 'PUT', data),
  events: (id: string, workspaceId?: string) => request<components['schemas']['EventResponse'][]>(`${inbox(workspaceId)}/${id}/events`),
  workList: (org: string, offset = 0, status = '') => request<WorkJob[]>(`/organizations/${org}/jobs?offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  work: (org: string, id: string) => request<WorkJob>(`/organizations/${org}/jobs/${id}`),
  createWork: (org: string, data: components['schemas']['WorkCreate']) => request<WorkJob>(`/organizations/${org}/jobs`, 'POST', data),
  assignWork: (id: string, data: components['schemas']['AssignWorkInput'], workspaceId?: string) => request<WorkJob>(`${inbox(workspaceId)}/${id}/work`, 'POST', data),
  workDetails: (org: string, id: string, data: components['schemas']['WorkDetails']) => request<WorkJob>(`/organizations/${org}/jobs/${id}`, 'PUT', data),
  workStatus: (org: string, id: string, data: components['schemas']['TransitionInput']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/status`, 'PUT', data),
  workEvents: (org: string, id: string) => request<components['schemas']['EventResponse'][]>(`/organizations/${org}/jobs/${id}/events`),
  deliverWork: (org: string, id: string, data: components['schemas']['DeliveryInput']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/delivery`, 'POST', data),
  generateDeliveryFile: (org: string, id: string, data: components['schemas']['GenerateDeliveryFile']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/delivery-document/file`, 'POST', data),
  deliveryFileUrl: (org: string, id: string, file: string, download = false) => apiResourceUrl(`/api/v1/organizations/${org}/jobs/${id}/delivery-document/files/${file}${download ? '?download=1' : ''}`),
  saveDeliveryDocument: (org: string, id: string, data: components['schemas']['DeliveryDocumentInput']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/delivery-document`, 'PUT', data),
}
