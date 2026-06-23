import type { InjectionKey, Ref } from 'vue'

export interface OutreachWorkspaceState {
  hiddenPartners: Ref<Set<string>>
  partnerSearch: Ref<string>
  selectedPartner: Ref<string | null>
  emailBody: Ref<string>
  emailSubject: Ref<string>
  emailTo: Ref<string>
  selectedArgumentIds: Ref<Set<string>>
  selectedContactIdx: Ref<number | null>
}

export const outreachWorkspaceKey = Symbol() as InjectionKey<OutreachWorkspaceState>

export interface OutreachActionsState {
  saving: Ref<boolean>
  sendToastVisible: Ref<boolean>
  sendToastSent: Ref<boolean>
  sendToastError: Ref<string>
  handleSaveAndClose: () => Promise<void>
  handleSaveAndSend: () => Promise<void>
  cancelSend: () => void
}

export const outreachActionsKey = Symbol() as InjectionKey<OutreachActionsState>
