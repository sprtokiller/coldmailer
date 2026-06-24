<script setup lang="ts">
import { outreachWorkspaceKey, type PartnerDbContact } from '~/composables/canvas/useOutreachWorkspace'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'

const workspace = inject(outreachWorkspaceKey)!
const pipeline = inject(pipelineRunKey) as PipelineRunContext

const alignment = computed(() => {
  const name = workspace.selectedPartner.value
  if (!name) return null
  const data = pipeline.alignmentOutputAlignments('VALUE_ALIGNMENT') as Array<Record<string, unknown>>
  return data.find(a => String(a.name ?? a.partnerName ?? '') === name) ?? null
})

const snapshot = computed(() => String(alignment.value?.partnerSnapshot ?? ''))

const contactsWithEmail = computed<PartnerDbContact[]>(() => workspace.dbContacts.value)

const selectedContact = computed(() => {
  const idx = workspace.selectedContactIdx.value ?? 0
  return contactsWithEmail.value[idx] ?? null
})

function selectContact(idx: number) {
  workspace.selectedContactIdx.value = idx
}

interface Argument {
  argumentId?: string
  argumentLabel?: string
  relevance?: string
  whyItFits?: string
  howToFrame?: string
  whatToAvoid?: string
  rank?: number
}

const arguments_ = computed<Argument[]>(() => {
  const top3 = alignment.value?.top3Arguments
  if (!Array.isArray(top3)) return []
  return top3 as Argument[]
})

function toggleArgument(id: string) {
  const s = new Set(workspace.selectedArgumentIds.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
  }
  workspace.selectedArgumentIds.value = s
}

function contactLabel(c: PartnerDbContact): string {
  const parts: string[] = []
  if (c.firstName || c.lastName) parts.push([c.firstName, c.lastName].filter(Boolean).join(' '))
  if (c.role) parts.push(c.role)
  return parts.join(' — ') || c.address
}

function tooltipText(arg: Argument): string {
  const lines: string[] = []
  if (arg.argumentLabel || arg.argumentId) lines.push(String(arg.argumentLabel || arg.argumentId))
  if (arg.whyItFits) lines.push('\nProč sedí: ' + arg.whyItFits)
  if (arg.howToFrame) lines.push('\nJak formulovat: ' + arg.howToFrame)
  if (arg.whatToAvoid) lines.push('\nČemu se vyhnout: ' + arg.whatToAvoid)
  return lines.join('')
}
</script>

<template>
  <div class="flex flex-col h-full">
    <template v-if="!workspace.selectedPartner.value">
      <div class="flex-1 flex items-center justify-center text-xs text-gray-400 px-6 text-center">
        Vyberte partnera ze seznamu vlevo
      </div>
    </template>

    <template v-else>
      <div class="flex-1 overflow-y-auto">
        <!-- Partner snapshot -->
        <div class="px-4 pt-3 pb-2 border-b border-gray-100">
          <h3 class="text-xs font-semibold text-gray-800 mb-1">{{ workspace.selectedPartner.value }}</h3>
          <p v-if="snapshot" class="text-[11px] text-gray-500 leading-relaxed">{{ snapshot }}</p>
        </div>

        <!-- Contact dropdown -->
        <div class="px-4 py-2.5 border-b border-gray-100">
          <label class="block text-[10px] font-medium text-gray-400 mb-1">Kontakt</label>

          <template v-if="contactsWithEmail.length > 0">
            <select
              :value="workspace.selectedContactIdx.value ?? 0"
              class="w-full border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              @change="selectContact(Number(($event.target as HTMLSelectElement).value))"
            >
              <option
                v-for="(c, i) in contactsWithEmail"
                :key="i"
                :value="i"
              >
                {{ contactLabel(c) }}
              </option>
            </select>

            <div v-if="selectedContact" class="mt-2 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
              <p v-if="selectedContact.firstName || selectedContact.lastName" class="text-xs font-medium text-gray-800">
                {{ [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') }}
              </p>
              <p v-if="selectedContact.role" class="text-[11px] text-gray-500">{{ selectedContact.role }}</p>
              <p class="text-[11px] text-primary font-medium">{{ selectedContact.address }}</p>
            </div>
          </template>

          <div v-else class="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
            Nenalezen žádný kontakt s e-mailem
          </div>
        </div>

        <!-- Arguments -->
        <div class="px-4 py-2.5">
          <label class="block text-[10px] font-medium text-gray-400 mb-1.5">Prodejní argumenty</label>

          <div v-if="arguments_.length === 0" class="text-[10px] text-gray-400">
            Žádné argumenty
          </div>

          <div class="space-y-1.5">
            <button
              v-for="arg in arguments_"
              :key="String(arg.argumentId)"
              type="button"
              class="w-full text-left rounded-lg border px-3 py-2 transition-colors"
              :class="workspace.selectedArgumentIds.value.has(String(arg.argumentId))
                ? 'bg-green-50 border-green-200'
                : 'bg-white border-gray-100 hover:border-gray-200'"
              :title="tooltipText(arg)"
              @click="toggleArgument(String(arg.argumentId))"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-gray-700">{{ arg.argumentLabel || arg.argumentId }}</span>
                <span v-if="arg.rank" class="ml-auto text-[9px] text-gray-400 shrink-0">#{{ arg.rank }}</span>
              </div>
              <p v-if="arg.whyItFits" class="mt-1 text-[10px] text-gray-500 leading-relaxed line-clamp-2">{{ arg.whyItFits }}</p>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
