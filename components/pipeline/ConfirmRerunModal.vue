<script setup lang="ts">
import { pipelineRunKey, type usePipelineRunPage, STEPS } from '~/composables/usePipelineRunPage'

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const stepLabel = computed(() => {
  const key = pipeline.pendingRerunConfirm?.stepKey
  return STEPS.find(s => s.key === key)?.label ?? key ?? ''
})

function confirm() {
  pipeline.pendingRerunConfirm?.resolve(true)
}

function cancel() {
  pipeline.pendingRerunConfirm?.resolve(false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="pipeline.pendingRerunConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="cancel"
    >
      <div class="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[calc(100vw-2rem)]">
        <h3 class="text-base font-semibold text-gray-900 mb-2">Znovu spustit krok?</h3>
        <p class="text-sm text-gray-600 mb-1">
          Krok <strong>{{ stepLabel }}</strong> již má výsledky.
        </p>
        <p class="text-sm text-gray-500 mb-6">
          Tato operace je nákladná — předchozí výsledky budou zachovány, ale zobrazí se nové.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            @click="cancel"
          >
            Zrušit
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg transition-opacity"
            @click="confirm"
          >
            Přesto spustit
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
