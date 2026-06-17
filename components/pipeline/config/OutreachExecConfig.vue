<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

defineProps<{ step: StepDefinition }>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const sigs = computed(() => Array.isArray(pipeline.signatures) ? pipeline.signatures : [])
const selectedSignatureId = ref(
  sigs.value.find(s => s.isDefault)?.id ?? '',
)

function onSignatureChange(id: string) {
  selectedSignatureId.value = id
  pipeline.applySignature(id)
}
</script>

<template>
  <div class="mt-4 space-y-4">
    <div v-if="pipeline.outreachEmails().length === 0" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      Nejprve spusťte Krok 5 (Outreach Preparation) pro vygenerování e-mailů.
    </div>
    <template v-else>
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">
          Vyberte partnera k odeslání
          <span class="text-danger ml-1">*</span>
        </label>
        <select
          v-model="pipeline.step6SelectedPartnerName"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          @change="pipeline.step6SelectedPartnerName && pipeline.initStep6Preview(pipeline.step6SelectedPartnerName)"
        >
          <option value="">— vyberte partnera —</option>
          <option
            v-for="email in pipeline.outreachEmails().filter(e => !e.error)"
            :key="String(email.partnerName ?? '')"
            :value="String(email.partnerName ?? '')"
          >
            {{ email.partnerName }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">Podpis</label>
        <select
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          :value="selectedSignatureId"
          @change="onSignatureChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">— bez podpisu —</option>
          <option v-for="sig in sigs" :key="sig.id" :value="sig.id">
            {{ sig.name }}{{ sig.isDefault ? ' (výchozí)' : '' }}
          </option>
        </select>
      </div>

      <template v-if="pipeline.step6SelectedPartnerName">
        <div class="space-y-3 rounded-xl border border-primary/20 bg-primary/3 p-4">
          <p class="text-xs font-semibold text-primary mb-1">Náhled e-mailu · upravte před odesláním</p>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Příjemce (To)</label>
            <input
              v-model="pipeline.step6PreviewTo"
              type="email"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="jmeno@firma.cz"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Předmět</label>
            <input
              v-model="pipeline.step6PreviewSubject"
              type="text"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Tělo e-mailu</label>
            <RichTextEditor v-model="pipeline.step6PreviewBody" />
          </div>
          <p class="text-[11px] text-gray-400">Kliknutím na „Spustit krok" vytvoříte draft přímo v Gmailu s výše uvedenými daty.</p>
        </div>
      </template>
    </template>
  </div>
</template>
