<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
  idx: number
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}
</script>

<template>
  <div
    class="bg-white rounded-xl border transition-all"
    :class="pipeline.activeStep === step.key ? 'border-primary/50 shadow-md' : 'border-gray-100'"
  >
    <button
      class="w-full flex items-center gap-4 p-5 text-left"
      @click="pipeline.activeStep = pipeline.activeStep === step.key ? null : step.key"
    >
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
        :class="pipeline.getStepResult(step.key)?.status === 'COMPLETED'
          ? 'bg-success text-white'
          : pipeline.getStepResult(step.key)?.status === 'FAILED'
          ? 'bg-danger text-white'
          : pipeline.executingStep === step.key
          ? 'bg-primary text-white animate-pulse'
          : 'bg-gray-100 text-gray-400'"
      >
        <svg v-if="pipeline.getStepResult(step.key)?.status === 'COMPLETED'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
        <svg v-else-if="pipeline.getStepResult(step.key)?.status === 'FAILED'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span v-else>{{ idx + 1 }}</span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-gray-800">{{ step.label }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="pipeline.modelBadge(step.key).cls">
            {{ pipeline.modelBadge(step.key).label }}
          </span>
        </div>
        <span class="block text-xs text-gray-400 mt-0.5">{{ step.description }}</span>
        <div v-if="pipeline.getStepResult(step.key) && pipeline.activeStep !== step.key" class="flex items-center mt-2 pt-2 border-t border-gray-50">
          <span class="text-xs font-medium text-gray-500">
            <span v-if="pipeline.stepResultRunnerName(step.key)">{{ pipeline.stepResultRunnerName(step.key) }}</span>
            <span v-if="pipeline.stepResultStatus(step.key)" class="ml-2">
              <span :class="pipeline.stepResultStatus(step.key) === 'COMPLETED' ? 'text-success' : 'text-danger'">
                {{ pipeline.stepResultStatus(step.key) }}
              </span>
            </span>
          </span>
        </div>
      </div>

      <svg
        class="w-4 h-4 text-gray-300 shrink-0 transition-transform"
        :class="pipeline.activeStep === step.key ? 'rotate-180' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="pipeline.activeStep === step.key" class="px-5 pb-5 border-t border-gray-50">
      <div class="pt-4 space-y-4">
        <PipelineStepConfig :step="step" :idx="idx" />
        <PipelineStepResult :step="step" />
      </div>
    </div>
  </div>
</template>
