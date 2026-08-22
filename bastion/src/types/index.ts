// ===== Roles dentro de una organización =====
export type OrgRole = 'OWNER' | 'MANAGER' | 'AUDITOR';

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Responsable del SGSI',
  MANAGER: 'Gestor',
  AUDITOR: 'Auditor (solo lectura)',
};

// ===== Sesión (payload del JWT) =====
export interface SessionPayload {
  userId: string;
  email: string;
  orgId: string;
  orgSlug: string;
  role: OrgRole;
  exp: number;
}

export interface Membership {
  org_id: string;
  org_slug: string;
  org_name: string;
  role: OrgRole;
}

// ===== Auditoría =====
export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED'
  | 'OTP_REQUESTED' | 'OTP_VERIFIED'
  | 'PASSWORD_CHANGED' | 'ORG_SWITCHED'
  | 'ASSET_CREATED' | 'ASSET_UPDATED' | 'ASSET_DELETED'
  | 'RISK_CREATED' | 'RISK_UPDATED' | 'RISK_DELETED'
  | 'SOA_UPDATED';

// ===== Activos =====
export type AssetType = 'INFORMATION' | 'SOFTWARE' | 'HARDWARE' | 'SERVICE' | 'PEOPLE' | 'FACILITY';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  INFORMATION: 'Información',
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  SERVICE: 'Servicio',
  PEOPLE: 'Personas',
  FACILITY: 'Instalación',
};

export interface Asset {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  type: AssetType;
  owner_name: string | null;
  location: string | null;
  confidentiality: number; // 1..3
  integrity: number;       // 1..3
  availability: number;    // 1..3
  status: 'ACTIVE' | 'RETIRED';
  created_at: string;
  updated_at: string;
}

// ===== Riesgos =====
export type RiskTreatment = 'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID';
export type RiskStatus = 'OPEN' | 'TREATING' | 'ACCEPTED' | 'CLOSED';

export const TREATMENT_LABELS: Record<RiskTreatment, string> = {
  MITIGATE: 'Mitigar',
  ACCEPT: 'Aceptar',
  TRANSFER: 'Transferir',
  AVOID: 'Evitar',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: 'Abierto',
  TREATING: 'En tratamiento',
  ACCEPTED: 'Aceptado',
  CLOSED: 'Cerrado',
};

export interface Risk {
  id: string;
  org_id: string;
  code: string;
  title: string;
  description: string | null;
  asset_id: string | null;
  threat: string | null;
  vulnerability: string | null;
  likelihood: number;      // 1..5
  impact: number;          // 1..5
  treatment: RiskTreatment;
  residual_likelihood: number | null;
  residual_impact: number | null;
  owner_name: string | null;
  status: RiskStatus;
  created_at: string;
  updated_at: string;
}

export interface RiskWithAsset extends Risk {
  asset_name: string | null;
  asset_code: string | null;
}

// ===== Controles / SoA =====
export type ControlTheme = 'A5' | 'A6' | 'A7' | 'A8';
export type SoaStatus = 'IMPLEMENTED' | 'IN_PROGRESS' | 'PLANNED' | 'NOT_APPLICABLE';

export const THEME_LABELS: Record<ControlTheme, string> = {
  A5: 'Organizacionales',
  A6: 'Personas',
  A7: 'Físicos',
  A8: 'Tecnológicos',
};

export const SOA_STATUS_LABELS: Record<SoaStatus, string> = {
  IMPLEMENTED: 'Implementado',
  IN_PROGRESS: 'En implementación',
  PLANNED: 'Planificado',
  NOT_APPLICABLE: 'No aplica',
};

export interface Control {
  ref: string;
  theme: ControlTheme;
  ordinal: number;
  title: string;
}

export interface SoaEntry {
  id: string;
  org_id: string;
  control_ref: string;
  applicable: boolean;
  status: SoaStatus;
  justification: string | null;
  owner_name: string | null;
  notes: string | null;
  updated_at: string;
}

export interface SoaEntryWithControl extends SoaEntry {
  theme: ControlTheme;
  ordinal: number;
  title: string;
}
