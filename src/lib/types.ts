import type { ContactRole, ListingStatus, Race, Stage } from './constants'

export type Deal = 'sale' | 'rent'
export type Role = 'admin' | 'staff'

interface Base {
  id: string
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface Contact extends Base {
  name: string
  phone: string | null
  race: Race | null
  roles: ContactRole[]
  note: string | null
  is_example: boolean
}

export interface Listing extends Base {
  deal: Deal | null
  address: string
  type: string | null
  price: number | null
  built_up_sqft: number | null
  land_sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
  furnishing: string | null
  tenure: string | null
  status: ListingStatus
  owner_id: string | null
  viewing_access: string | null
  note: string | null
  is_example: boolean
}

export interface Lead extends Base {
  contact_id: string | null
  deal: Deal | null
  property_types: string[]
  areas: string | null
  budget_min: number | null
  budget_max: number | null
  stage: Stage
  next_follow_up: string | null
  source: string | null
  timeline: string | null
  lost_reason: string | null
  last_contacted_at: string | null
  is_example: boolean
}

export interface LeadNote extends Base {
  lead_id: string
  text: string
}

export interface Tenancy extends Base {
  tenant_name: string
  phone: string | null
  address: string | null
  start_date: string | null
  end_date: string | null
  pay_day: number | null
  rent: number | null
  account_holder: string | null
  bank: string | null
  account_number: string | null
  is_example: boolean
}

export interface TenancyPayment extends Base {
  tenancy_id: string
  month: string // YYYY-MM-01
  paid: boolean
}

export interface DB {
  contacts: Contact[]
  listings: Listing[]
  leads: Lead[]
  lead_notes: LeadNote[]
  tenancies: Tenancy[]
  tenancy_payments: TenancyPayment[]
}

export type TableName = keyof DB
export const TABLES: TableName[] = ['contacts', 'listings', 'leads', 'lead_notes', 'tenancies', 'tenancy_payments']

export type RowOf<T extends TableName> = DB[T][number]
