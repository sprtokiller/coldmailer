<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: runs, refresh } = await useFetch('/api/pipeline', { default: () => [] })

const creating = ref(false)
const newName = ref('')

async function createRun() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const run = await $fetch('/api/pipeline', {
      method: 'POST',
      body: { name: newName.value.trim() },
    })
    newName.value = ''
    await navigateTo(`/pipeline/${run.id}`)
  } finally {
    creating.value = false
  }
}

function stepCount(steps: { status: string }[]) {
  return {
    total: steps.length,
    done: steps.filter((s) => s.status === 'COMPLETED').length,
    failed: steps.filter((s) => s.status === 'FAILED').length,
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Oslovování partnerů</h1>
        <p class="text-sm text-gray-400 mt-1">Vytvořte si vlastní AI pipeline či využijte některou z nabídky. </p>
      </div>
      <form class="flex gap-2" @submit.prevent="createRun">
        <input
          v-model="newName"
          type="text"
          placeholder="Název nové pipeline…"
          class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
          required
        />
        <button
          type="submit"
          :disabled="creating"
          class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {{ creating ? 'Vytváření…' : 'Nová Pipeline' }}
        </button>
      </form>
    </div>

    <div v-if="runs.length === 0" class="text-center py-20 text-gray-400 text-sm">
      Zatím žádné pipeline. Vytvořte jednu pro začátek.
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="run in runs"
        :key="run.id"
        :to="`/pipeline/${run.id}`"
        class="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-primary/30 transition-all group"
      >
        <div class="flex items-start justify-between mb-3">
          <h3 class="font-medium text-gray-800 group-hover:text-primary transition-colors">
            {{ run.name }}
          </h3>
          <span class="text-xs text-gray-400 whitespace-nowrap ml-2 mt-0.5">
            {{ new Date(run.createdAt).toLocaleDateString('cs-CZ') }}
          </span>
        </div>

        <div class="flex items-center gap-2 mb-4">
          <img
            v-if="run.author.image"
            :src="run.author.image"
            :alt="run.author.name"
            class="w-5 h-5 rounded-full"
            referrerpolicy="no-referrer"
          />
          <span class="text-xs text-gray-400">{{ run.author.name }}</span>
        </div>

        <div v-if="run.steps.length > 0">
          <div class="flex gap-1 mb-2">
            <div
              v-for="(step, i) in run.steps"
              :key="i"
              class="h-1.5 rounded-full flex-1"
              :class="{
                'bg-success': step.status === 'COMPLETED',
                'bg-danger': step.status === 'FAILED',
                'bg-primary': step.status === 'RUNNING',
                'bg-gray-200': step.status === 'PENDING',
              }"
            />
          </div>
          <p class="text-xs text-gray-400">
            {{ stepCount(run.steps).done }} / {{ stepCount(run.steps).total }} kroků dokončeno
          </p>
        </div>
        <p v-else class="text-xs text-gray-400">Zatím nebyly spuštěny žádné kroky</p>
      </NuxtLink>
    </div>
  </div>
</template>
