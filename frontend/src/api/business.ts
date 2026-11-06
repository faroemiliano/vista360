import { getSession, request } from './client'
import type { components } from './schema'

export type Organization = components['schemas']['OrganizationResponse']
export type Property = components['schemas']['PropertyResponse']
export type Client = components['schemas']['ClientResponse']
export type Member = components['schemas']['MemberResponse']
export type ServiceJob = components['schemas']['ServiceResponse']
export type WorkJob = components['schemas']['WorkResponse']
export type BusinessWorkspace = components['schemas']['WorkspaceResponse']
export const businessApi = {
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
  submitService: async (data: components['schemas']['ServiceInput']) => {
    await getSession()
    return request<components['schemas']['ServiceReceipt']>('/service-requests', 'POST', data)
  },
  jobs: (offset: number) => request<ServiceJob[]>(`/admin/service-requests?offset=${offset}&limit=50`),
  serviceRequest: (id: string) => request<ServiceJob>(`/admin/service-requests/${id}`),
  transition: (id: string, data: components['schemas']['TransitionInput']) => request<ServiceJob>(`/admin/service-requests/${id}/status`, 'PUT', data),
  events: (id: string) => request<components['schemas']['EventResponse'][]>(`/admin/service-requests/${id}/events`),
  workList: (org: string, offset = 0, status = '') => request<WorkJob[]>(`/organizations/${org}/jobs?offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  work: (org: string, id: string) => request<WorkJob>(`/organizations/${org}/jobs/${id}`),
  createWork: (org: string, data: components['schemas']['WorkCreate']) => request<WorkJob>(`/organizations/${org}/jobs`, 'POST', data),
  assignWork: (id: string, data: components['schemas']['AssignWorkInput']) => request<WorkJob>(`/admin/service-requests/${id}/work`, 'POST', data),
  workDetails: (org: string, id: string, data: components['schemas']['WorkDetails']) => request<WorkJob>(`/organizations/${org}/jobs/${id}`, 'PUT', data),
  workStatus: (org: string, id: string, data: components['schemas']['TransitionInput']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/status`, 'PUT', data),
  workEvents: (org: string, id: string) => request<components['schemas']['EventResponse'][]>(`/organizations/${org}/jobs/${id}/events`),
  deliverWork: (org: string, id: string, data: components['schemas']['DeliveryInput']) => request<WorkJob>(`/organizations/${org}/jobs/${id}/delivery`, 'POST', data),
}
