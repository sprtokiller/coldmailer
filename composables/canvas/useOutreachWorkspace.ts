import type { InjectionKey, Ref } from 'vue'

export interface OutreachWorkspaceState {
  hiddenPartners: Ref<Set<string>>
  partnerSearch: Ref<string>
  selectedPartner: Ref<string | null>
  emailBody: Ref<string>
  selectedArgumentIds: Ref<Set<string>>
  selectedContactIdx: Ref<number | null>
}

export const outreachWorkspaceKey = Symbol() as InjectionKey<OutreachWorkspaceState>
