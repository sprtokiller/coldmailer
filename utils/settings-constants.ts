export type Role = { id: string; name: string; description: string | null; color: string; permissions: string[]; isSystem: boolean }
export type PermOverride = { id: string; key: string; granted: boolean }
export type BudgetResetPeriod = 'never' | 'daily' | 'weekly' | 'monthly'
export type Budget = { limitUsd: number | null; usedUsd: number; resetPeriod: BudgetResetPeriod; periodStartAt: string | null }
export type GroupInfo = { id: string; name: string; slug: string; color: string }

export type MeResponse = {
  user: { id: string; email: string; name: string; image: string | null; isSuperAdmin: boolean; createdAt: string }
  roles: Role[]
  permOverrides: PermOverride[]
  budget: Budget | null
  effectivePermissions: string[]
}

export type AdminUser = {
  id: string; email: string; name: string; image: string | null
  isSuperAdmin: boolean; createdAt: string
  roles: Role[]; groups: GroupInfo[]; permOverrides: PermOverride[]
  budget: Budget | null; effectivePermissions: string[]
}

export type BudgetUser = {
  id: string; name: string; email: string; image: string | null
  isSuperAdmin: boolean; createdAt: string
  budget: Budget | null
  stats30d: { aiCost: number; aiCount: number; serpCount: number }
}

export type DefaultBudgetCfg = { limitUsd: number | null; resetPeriod: BudgetResetPeriod }
export type BudgetResponse = { users: BudgetUser[]; defaultBudget: DefaultBudgetCfg }

export const PERMISSION_GROUPS = [
  { label: 'Systémové prompty', keys: ['prompts.system.read', 'prompts.system.edit'] },
  { label: 'Vlastní prompty', keys: ['prompts.own.read', 'prompts.own.edit'] },
  { label: 'Cizí prompty', keys: ['prompts.others.read', 'prompts.others.edit'] },
  { label: 'Kontextové části', keys: ['context.own.read', 'context.own.edit', 'context.others.read', 'context.others.edit'] },
  { label: 'Prodejní argumenty', keys: ['selling.own.read', 'selling.own.edit', 'selling.others.read', 'selling.others.edit'] },
  { label: 'Mailové šablony', keys: ['drafts.own.read', 'drafts.own.edit', 'drafts.others.read', 'drafts.others.edit'] },
  { label: 'Podpisy', keys: ['signatures.own.edit', 'signatures.system.edit'] },
  { label: 'Pipeline', keys: ['pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail'] },
  { label: 'Správa', keys: ['admin.roles'] },
]

export const PERMISSION_LABELS: Record<string, string> = {
  'prompts.system.read': 'Číst systémové prompty',
  'prompts.system.edit': 'Upravovat systémové prompty',
  'prompts.own.read': 'Číst vlastní prompty',
  'prompts.own.edit': 'Vytvářet / editovat vlastní prompty',
  'prompts.others.read': 'Číst cizí prompty',
  'prompts.others.edit': 'Upravovat cizí prompty',
  'context.own.read': 'Číst vlastní kontextové části',
  'context.own.edit': 'Vytvářet / editovat vlastní kontextové části',
  'context.others.read': 'Číst cizí kontextové části',
  'context.others.edit': 'Upravovat cizí kontextové části',
  'selling.own.read': 'Číst vlastní prodejní argumenty',
  'selling.own.edit': 'Vytvářet / editovat vlastní prodejní argumenty',
  'selling.others.read': 'Číst cizí prodejní argumenty',
  'selling.others.edit': 'Upravovat cizí prodejní argumenty',
  'drafts.own.read': 'Číst vlastní e-mailové šablony',
  'drafts.own.edit': 'Vytvářet / editovat vlastní e-mailové šablony',
  'drafts.others.read': 'Číst cizí e-mailové šablony',
  'drafts.others.edit': 'Upravovat cizí e-mailové šablony',
  'signatures.own.edit': 'Vytvářet / editovat vlastní podpisy',
  'signatures.system.edit': 'Spravovat podpisové šablony (systémové)',
  'pipeline.serpapi': 'Spouštět Partner Identification (SerpAPI)',
  'pipeline.deep_research': 'Spouštět deep-research kroky (o4-mini)',
  'pipeline.claude': 'Spouštět Claude kroky',
  'pipeline.gmail': 'Vytvářet Gmail drafty',
  'admin.roles': 'Správa rolí a oprávnění uživatelů',
}

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS)

export const ROLE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']

export const RESET_PERIOD_LABELS: Record<BudgetResetPeriod, string> = {
  never: 'Bez resetu',
  daily: 'Denně',
  weekly: 'Týdně',
  monthly: 'Měsíčně',
}

export const MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'openai/o4-mini': 'o4-mini',
  'openai/gpt-4o': 'GPT-4o',
  'pipeline/partner-identification': 'Partner Identification',
  'serpapi': 'SerpAPI',
}

export function modelLabel(m: string) { return MODEL_LABELS[m] ?? m }
