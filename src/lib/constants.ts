export const PROPERTY_TYPES = [
  'Condo / Apartment',
  'Low Cost Flat',
  'Low Cost House',
  '1 / 1.5 Storey Terrace House',
  '2 / 2.5 Storey Terrace House',
  'Cluster House',
  'Semi D House',
  'Bungalow House',
  'Townhouse',
  'Shop',
  'Shop Office',
  'Terraced Factory',
  'Cluster Factory',
  'Semi D Factory',
  'Land',
] as const

export const STAGES = ['New', 'Contacted', 'Viewing Set', 'Viewed', 'Negotiating', 'Booked', 'Closed', 'Lost'] as const
export type Stage = (typeof STAGES)[number]
export const OPEN_STAGES: readonly Stage[] = ['New', 'Contacted', 'Viewing Set', 'Viewed', 'Negotiating', 'Booked']
export const VIEWING_TO_BOOKING: readonly Stage[] = ['Viewing Set', 'Viewed', 'Negotiating', 'Booked']

export const SOURCES = [
  'Mudah',
  'Google / AI',
  'PropertyGuru',
  'iProperty',
  'EdgeProp',
  'Facebook',
  'NextSix',
  'Referral',
  'Banner',
  'XiaoHongShu',
  'Other',
] as const

export const LISTING_STATUSES = ['available', 'sold', 'rented', 'withdrawn'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]
export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  available: 'Available',
  sold: 'Sold',
  rented: 'Rented',
  withdrawn: 'Withdrawn',
}

export const RACES = ['Chinese', 'Malay', 'Indian', 'Others'] as const
export type Race = (typeof RACES)[number]

export const CONTACT_ROLES = ['owner', 'landlord', 'buyer', 'tenant', 'agent'] as const
export type ContactRole = (typeof CONTACT_ROLES)[number]
export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  owner: 'Owner',
  landlord: 'Landlord',
  buyer: 'Buyer',
  tenant: 'Tenant',
  agent: 'Co-Agent',
}

export const FURNISHING = ['Unfurnished', 'Partly furnished', 'Fully furnished'] as const
export const TENURE = ['Freehold', 'Leasehold', 'Malay reserve', 'Bumi lot'] as const

export const BANKS = [
  'Affin Bank',
  'Alliance Bank',
  'AmBank',
  'Bank Islam',
  'Bank Muamalat',
  'BSN',
  'CIMB',
  'Hong Leong Bank',
  'HSBC',
  'Maybank',
  'OCBC',
  'Public Bank',
  'RHB',
  'Standard Chartered Bank',
  'UOB',
] as const

export const LISTING_HUB_URL = 'https://claude.ai/artifact/VNvznHo5C7ZCFQFvdMKbxL'

export const OWNER_NAME = 'Constance Chan'
export const REN = 'PEA3963'

/** Known Johor Bahru area names the lead parser looks for anywhere in the text. */
export const JB_AREAS = [
  'Mount Austin', 'Austin Heights', 'Austin Perdana', 'Seri Austin', 'Tebrau', 'Setia Indah', 'Setia Tropika',
  'Skudai', 'Taman Universiti', 'Desa Cemerlang', 'Permas Jaya', 'Bukit Indah', 'Nusa Bestari', 'Molek',
  'Taman Molek', 'Pelangi', 'Taman Pelangi', 'Danga Bay', 'Iskandar Puteri', 'Nusajaya', 'Medini', 'Kulai',
  'Senai', 'Masai', 'Kota Masai', 'Pasir Gudang', 'Johor Jaya', 'Taman Daya', 'Sutera Utama', 'Ulu Tiram',
  'Seri Alam', 'Horizon Hills', 'Larkin', 'Stulang', 'Tampoi', 'Kempas', 'Gelang Patah', 'Eco Botanic',
  'Eco Spring', 'Eco Summer', 'Perling', 'Ponderosa', 'Impian Emas', 'Mutiara Rini', 'Adda Heights',
  'Bukit Dahlia', 'Taman Rinting', 'Bayu Puteri', 'Kangkar Pulai', 'Lima Kedai', 'Puteri Harbour',
  'Bandar Baru Uda', 'Taman Sentosa', 'Century Garden', 'Taman Century', 'Ledang Heights', 'Mount Tiram',
  'Bukit Tiram', 'Taman Scientex', 'Scientex', 'Taman Johor Jaya', 'Pandan', 'Bandar Dato Onn', 'Dato Onn',
  'Taman Abad', 'Majidee', 'Taman Sri Tebrau', 'Sri Tebrau', 'Taman Ungku Tun Aminah', 'Ungku Tun Aminah',
  'Bukit Mewah', 'Saleng', 'Indahpura', 'Taman Mount Austin', 'JB Town', 'Taman Perling', 'Taman Nusa Bestari',
] as const

export const DEAL_STATUSES = ['forecast', 'converted', 'gone', 'claimed'] as const
export const DEAL_STATUS_LABEL: Record<(typeof DEAL_STATUSES)[number], string> = {
  forecast: 'Forecast',
  converted: 'Converted',
  gone: 'Gone',
  claimed: 'Claimed',
}

export const GONE_REASONS = [
  'Price',
  'Financing / Loan Rejected',
  'Buyer Backed Out',
  'Owner Backed Out',
  'Found Another Unit',
  'Low Valuation',
  'Timing',
  'Other',
] as const
