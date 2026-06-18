<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: runs, refresh } = await useFetch('/api/pipeline', { default: () => [] })
const { projects, activeProject, activeGroup } = useActiveProject()

const creating = ref(false)
const newName = ref('')
const createErrorMessage = ref('')

async function createRun() {
  if (!newName.value.trim() || !activeProject.value) return
  creating.value = true
  createErrorMessage.value = ''
  try {
    const run = await $fetch('/api/pipeline', {
      method: 'POST',
      body: {
        name: newName.value.trim(),
        projectId: activeProject.value.id,
      },
    })
    newName.value = ''
    await navigateTo(`/pipeline/${run.id}`)
  } catch (error: any) {
    createErrorMessage.value = error?.data?.statusMessage ?? 'Pipeline se nepodařilo vytvořit.'
  } finally {
    creating.value = false
  }
}

type RunStats = NonNullable<typeof runs.value>[0]['stats']

const STAT_DEFS: { key: keyof RunStats; label: string; tooltip: string }[] = [
  { key: 'competitions', label: 'soutěží',     tooltip: 'Soutěže a akce (Market Scanning)' },
  { key: 'partners',     label: 'partnerů',    tooltip: 'Unikátní identifikovaní partneři (Identifikace)' },
  { key: 'profiles',     label: 'profilů',     tooltip: 'Profilovaní partneři (Profilování)' },
  { key: 'alignments',   label: 'alignmentů',  tooltip: 'Partneři s Value Alignmentem' },
  { key: 'outreach',     label: 'e-mailů',     tooltip: 'Připravené návrhy e-mailů k oslovení' },
  { key: 'sent',         label: 'v Gmailu',    tooltip: 'Drafty vytvořené v Gmailu (Odeslání)' },
]
</script>

<template>
  <div>
    <div
      v-if="!activeProject && !activeGroup"
      class="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900"
      role="alert"
    >
      <div class="font-semibold">Nemáte přiřazený žádný projekt ani typ projektu</div>
      <p class="mt-1 text-sm text-amber-800">
        Pipeline ani knihovnu nelze spravovat, dokud vám administrátor nepřiřadí přístup.
      </p>
    </div>

    <div
      v-else-if="!activeProject"
      class="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900"
      role="alert"
    >
      <div class="font-semibold">Nemáte přiřazený žádný projekt</div>
      <p class="mt-1 text-sm text-amber-800">
        Pro správu pipelines vám musí administrátor přiřadit konkrétní projekt.
      </p>
    </div>

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
          :disabled="!activeProject"
        />
        <button
          type="submit"
          :disabled="creating || !activeProject"
          class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {{ creating ? 'Vytváření…' : 'Nová Pipeline' }}
        </button>
      </form>
    </div>


    <p v-if="createErrorMessage" class="-mt-5 mb-6 text-sm text-red-600">{{ createErrorMessage }}</p>

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

        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
          <template v-for="def in STAT_DEFS" :key="def.key">
            <span
              v-if="run.stats[def.key] !== null"
              class="text-xs text-gray-500 tabular-nums"
              :title="def.tooltip"
            >
              <span class="font-semibold text-gray-800">{{ run.stats[def.key] }}</span>
              {{ def.label }}
            </span>
          </template>
          <span
            v-if="STAT_DEFS.every(d => run.stats[d.key] === null)"
            class="text-xs text-gray-400"
          >Zatím nebyly spuštěny žádné kroky</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
