<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
  submitAttempted: boolean
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
</script>

<template>
  <div class="mt-4 space-y-4">
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">
        E-mailová šablona
        <span class="text-danger ml-1">*</span>
      </label>
      <select
        v-model="pipeline.getConfig(step.key).emailDraftId"
        class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
        :class="submitAttempted && !pipeline.getConfig(step.key).emailDraftId
          ? 'border-danger/50 focus:ring-danger/30 bg-danger/5'
          : 'border-gray-200 focus:ring-primary/30'"
      >
        <option value="">— vyberte šablonu z knihovny —</option>
        <option v-for="d in pipeline.emailDrafts" :key="d.id" :value="d.id">
          {{ d.name }} · {{ d.subject }}
        </option>
      </select>
      <p
        class="mt-1 text-xs text-danger"
        :class="{ invisible: !(submitAttempted && !pipeline.getConfig(step.key).emailDraftId) }"
      >
        E-mailová šablona je povinná – AI ji použije jako základ pro personalizaci.
      </p>
    </div>

    <div v-if="pipeline.step5Alignments().length === 0" class="text-xs text-gray-400 py-2">
      Nejprve spusťte Krok 4 (Value Alignment), abyste získali partnery pro oslovení.
    </div>
    <template v-else>
      <div class="flex items-center justify-between mb-2">
        <label class="block text-xs font-medium text-gray-500">
          Partneři z Kroku 4
          <span class="ml-1 font-normal text-gray-400">({{ pipeline.step5SelectedCount() }} / {{ pipeline.step5Alignments().length }} vybráno)</span>
        </label>
        <div class="flex items-center gap-3">
          <button type="button" class="text-xs text-primary hover:underline" @click="pipeline.step5SelectAll()">Vše</button>
          <button type="button" class="text-xs text-amber-500 hover:underline" @click="pipeline.step5SelectUnprocessed()">Nevypracované</button>
          <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step5DeselectAll()">Žádné</button>
        </div>
      </div>
      <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
        <div class="grid grid-cols-[1.5rem_1fr_10rem_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span></span><span>Partner</span><span>Celková shoda</span><span>Top argument</span>
        </div>
        <label
          v-for="a in pipeline.step5Alignments()"
          :key="String(a.name ?? '')"
          class="grid grid-cols-[1.5rem_1fr_10rem_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
          :class="pipeline.step5SelectedIds[String(a.name ?? '')] ? '' : 'opacity-50'"
        >
          <input type="checkbox" v-model="pipeline.step5SelectedIds[String(a.name ?? '')]" class="accent-primary" />
          <span class="font-medium text-gray-700 truncate" :title="String(a.name ?? '')">{{ a.name }}</span>
          <span
            class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
            :class="a.overallFitScore === 'Vysoký' ? 'text-success bg-success/10' : a.overallFitScore === 'Střední' ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-100'"
          >{{ a.overallFitScore ?? '–' }}</span>
          <span class="text-gray-400 truncate text-[10px]">
            {{ Array.isArray(a.top3Arguments) && (a.top3Arguments as Record<string, unknown>[]).length
              ? String((a.top3Arguments as Record<string, unknown>[])[0].argumentId ?? '')
              : '–' }}
          </span>
        </label>
      </div>
    </template>
  </div>
</template>
