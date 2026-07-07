export type BudgetResetPeriod = 'never' | 'daily' | 'weekly' | 'monthly'
export type Budget = { limitUsd: number | null; usedUsd: number; resetPeriod: BudgetResetPeriod; periodStartAt: string | null }
export type ProjectInfo = {
  id: string
  name: string
  slug: string
  groupId: string
  group: { id: string; name: string; slug: string; color: string }
}
export type ProjectRoleInfo = {
  id: string
  name: string
  permissions: string[]
  isSystem: boolean
}
export type GroupInfo = {
  id: string
  name: string
  slug: string
  color: string
  projects: Array<Omit<ProjectInfo, 'group'> & { projectRoles?: ProjectRoleInfo[] }>
}

export type MeResponse = {
  user: { id: string; email: string; name: string; image: string | null; isAdmin: boolean; createdAt: string }
  budget: Budget | null
  projectRoles: ProjectRoleAssignment[]
}

export type ProjectRoleAssignment = {
  id: string
  name: string
  project: { id: string; name: string; slug: string; groupId: string; group: { id: string; name: string; slug: string; color: string } }
}
export type AdminUser = {
  id: string; email: string; name: string; image: string | null
  isAdmin: boolean; createdAt: string; lastLoginAt: string | null
  projectRoles: ProjectRoleAssignment[]
  budget: Budget | null
  unreadEmailCount: number
}

export type BudgetUser = {
  id: string; name: string; email: string; image: string | null
  isAdmin: boolean; createdAt: string
  budget: Budget | null
  stats30d: { aiCost: number; aiCount: number; serpCount: number }
}

export type DefaultBudgetCfg = { limitUsd: number | null; resetPeriod: BudgetResetPeriod }
export type BudgetResponse = { users: BudgetUser[]; defaultBudget: DefaultBudgetCfg }

export type ProjectMember = {
  id: string; name: string; email: string; image: string | null
  lastLoginAt: string | null
  roles: string[]
  unreadEmailCount: number
}
export type ManagedProject = {
  id: string; name: string; slug: string
  group: { id: string; name: string; color: string }
  members: ProjectMember[]
}

export const RESET_PERIOD_LABELS: Record<BudgetResetPeriod, string> = {
  never: 'Bez resetu',
  daily: 'Denně',
  weekly: 'Týdně',
  monthly: 'Měsíčně',
}

export const MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'anthropic/claude-sonnet-5': 'Claude Sonnet 5',
  'openai/o4-mini': 'o4-mini',
  'openai/gpt-4o': 'GPT-4o',
  'pipeline/partner-identification': 'Partner Identification',
  'serpapi': 'SerpAPI',
}

export function modelLabel(m: string) { return MODEL_LABELS[m] ?? m }
