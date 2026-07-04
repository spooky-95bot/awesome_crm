// src/types/index.ts — paylaşılan API tipleri (backend sözleşmesi).
export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; roles: string[] };
}

export interface Deal {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  value: string | null;
  currency: string;
  status: 'OPEN' | 'WON' | 'LOST';
  stageId: string;
  rank: string;
}

export interface BoardStage {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
  deals: Deal[];
}

export interface Board {
  pipelineId: string;
  stages: BoardStage[];
}

export interface Invoice {
  id: string;
  number: string | null;
  customerName: string;
  status: string;
  currency: string;
  // finansal (yalnız invoice.read_financial ile gelir)
  total?: string;
  amountPaid?: string;
  subtotal?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
}

export interface Brand {
  id: string;
  name: string;
  sector: string | null;
  niche: string | null;
  description: string | null;
  targetAudience: string | null;
  priceBand: string | null;
  markets: string[];
  keywords: string[];
  answers: {
    knownCompetitors?: string[];
    suggestedCompetitors?: string[];
    adSearchTerms?: string[];
  } | null;
  aiEnriched: boolean;
  createdAt: string;
}

export type LeadChannel = 'MANUAL' | 'IMPORT' | 'FORM' | 'WEBHOOK' | 'API';

export interface UnqualifiedLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  channel: LeadChannel;
  formId: string | null;
  status: 'NEW' | 'WORKING' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
}

export interface LeadFormField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
}

export interface LeadForm {
  id: string;
  name: string;
  publicKey: string;
  secret?: string; // yalnız oluşturma yanıtında / reveal'da
  fields: LeadFormField[];
  buttonColor: string;
  buttonLabel: string;
  successMessage: string | null;
  redirectUrl: string | null;
  isActive: boolean;
  submitCount: number;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  phone: string | null;
  website: string | null;
  contactCount: number;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}
