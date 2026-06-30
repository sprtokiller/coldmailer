<script setup lang="ts">
import { projectOutreachKey, useProjectOutreach } from '~/composables/useProjectOutreach'

definePageMeta({ middleware: 'auth' })

const { activeProject } = useActiveProject()
const projectId = computed(() => activeProject.value?.id ?? null)

const ctx = useProjectOutreach(projectId)
provide(projectOutreachKey, ctx)

type Tab = 'alignment' | 'email'
const activeTab = ref<Tab>('alignment')

// Pokud partner nemá alignment, zůstaňme na alignment tabu;
// po dokončení alignment automaticky přepni na email
watch(() => ctx.executing.value, (val, prev) => {
  if (prev === 'alignment' && val === null) activeTab.value = 'email'
})
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)]">
    <!-- Partner sidebar -->
    <aside class="w-56 shrink-0 border-r border-gray-100 flex flex-col bg-white overflow-hidden">
      <div class="px-3 py-2 border-b border-gray-100 shrink-0">
        <h2 class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Oslovení</h2>
      </div>
      <OutreachPartnerSidebar class="flex-1 min-h-0" />
    </aside>

    <!-- Main area with tabs -->
    <div class="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      <!-- Tab bar -->
      <div class="flex items-center border-b border-gray-100 shrink-0 px-4">
        <button
          class="px-3 py-2.5 text-xs font-medium border-b-2 transition-colors mr-1"
          :class="activeTab === 'alignment'
            ? 'border-violet-500 text-violet-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = 'alignment'"
        >
          1 · Value Alignment
          <span
            v-if="ctx.partnerDetail.value?.alignment"
            class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-violet-400"
          />
        </button>
        <button
          class="px-3 py-2.5 text-xs font-medium border-b-2 transition-colors"
          :class="activeTab === 'email'
            ? 'border-indigo-500 text-indigo-700'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = 'email'"
        >
          2 · E-mail
          <span
            v-if="ctx.partnerDetail.value?.draft"
            class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400"
          />
        </button>
      </div>

      <!-- Tab panels -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <OutreachAlignmentPanel v-show="activeTab === 'alignment'" class="h-full" />
        <OutreachEmailPanel v-show="activeTab === 'email'" class="h-full" />
      </div>
    </div>
  </div>
</template>
