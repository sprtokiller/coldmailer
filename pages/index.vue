<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: runs, refresh } = await useFetch('/api/pipeline', { default: () => [] })
const { projects, activeProject, activeGroup } = useActiveProject()
const { session } = useUserSession()
const isAdmin = computed(() => session.value?.user?.isAdmin ?? false)

const { data: me } = await useFetch('/api/settings/me', { key: 'index-page-me' })
const canManagePipelinesForProject = computed(() => {
  if (isAdmin.value) return true
  if (!activeProject.value) return false
  return (me.value?.projectRoles ?? [])
    .filter((r: any) => r.project?.id === activeProject.value?.id)
    .some((r: any) => (r.permissions as string[]).includes('project.pipeline.manage'))
})

const showCreateModal = ref(false)
const creating = ref(false)
const newName = ref('')
const newMode = ref<'full' | 'short'>('full')
const newVisibility = ref<'private' | 'public'>('private')
const createErrorMessage = ref('')

function openCreateModal() {
  newName.value = ''
  newMode.value = 'full'
  newVisibility.value = 'private'
  createErrorMessage.value = ''
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  createErrorMessage.value = ''
}

async function createRun() {
  if (!newName.value.trim() || !activeProject.value) return
  creating.value = true
  createErrorMessage.value = ''
  try {
    const run = await $fetch('/api/pipeline', {
      method: 'POST',
      body: {
        name: newName.value.trim(),
        mode: newMode.value,
        visibility: newVisibility.value,
        projectId: activeProject.value.id,
      },
    })
    closeCreateModal()
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
]

// ── Kebab menu ────────────────────────────────────────────────────────────────
const openMenuId = ref<string | null>(null)

function toggleMenu(id: string, e: Event) {
  e.preventDefault()
  e.stopPropagation()
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeAllMenus() {
  openMenuId.value = null
}

onMounted(() => {
  document.addEventListener('click', closeAllMenus)
  onUnmounted(() => document.removeEventListener('click', closeAllMenus))
})

// ── Edit modal ────────────────────────────────────────────────────────────────
const editingRun = ref<{ id: string; name: string; visibility: string } | null>(null)
const editName = ref('')
const editVisibility = ref<'private' | 'public'>('private')
const editSaving = ref(false)
const editDeleting = ref(false)

function openEdit(run: { id: string; name: string; visibility: string }, e: Event) {
  e.preventDefault()
  e.stopPropagation()
  editingRun.value = run
  editName.value = run.name
  editVisibility.value = (run.visibility === 'public' ? 'public' : 'private')
}

async function saveEdit() {
  if (!editingRun.value || !editName.value.trim()) return
  editSaving.value = true
  try {
    await $fetch(`/api/pipeline/${editingRun.value.id}`, {
      method: 'PATCH',
      body: {
        name: editName.value.trim(),
        visibility: editVisibility.value,
      },
    })
    editingRun.value = null
    await refresh()
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? 'Nepodařilo se uložit.')
  } finally {
    editSaving.value = false
  }
}

async function deleteRun() {
  if (!editingRun.value) return
  if (!confirm(`Opravdu chcete smazat pipeline „${editingRun.value.name}"? Tato akce je nevratná.`)) return
  editDeleting.value = true
  try {
    await $fetch(`/api/pipeline/${editingRun.value.id}`, { method: 'DELETE' })
    editingRun.value = null
    await refresh()
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? 'Nepodařilo se smazat.')
  } finally {
    editDeleting.value = false
  }
}
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
      <button
        v-if="canManagePipelinesForProject"
        type="button"
        :disabled="!activeProject"
        class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        @click="openCreateModal"
      >
        Nová Pipeline
      </button>
    </div>

    <div v-if="runs.length === 0" class="text-center py-20 text-gray-400 text-sm">
      Zatím žádné pipeline. Vytvořte jednu pro začátek.
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        v-for="run in runs"
        :key="run.id"
        :to="`/pipeline/${run.id}`"
        class="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-primary/30 transition-all group relative"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="font-medium text-gray-800 group-hover:text-primary transition-colors truncate">
              {{ run.name }}
            </h3>
            <span
              class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              :class="run.mode === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
              :title="run.mode === 'short' ? 'Zkrácená pipeline' : 'Úplná pipeline'"
            >{{ run.mode === 'short' ? 'Zkrácená' : 'Úplná' }}</span>
            <span
              v-if="run.visibility === 'public'"
              class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600"
              title="Veřejná pipeline"
            >Veřejná</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 ml-2">
            <span class="text-xs text-gray-400 whitespace-nowrap mt-0.5">
              {{ new Date(run.createdAt).toLocaleDateString('cs-CZ') }}
            </span>
            <!-- Three-dot kebab menu -->
            <div class="relative">
              <button
                class="text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded"
                title="Možnosti"
                @click="toggleMenu(run.id, $event)"
              >
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              <div
                v-if="openMenuId === run.id"
                class="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
                @click.stop
              >
                <button
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  @click="openEdit(run, $event); openMenuId = null"
                >
                  Upravit pipeline
                </button>
                <button
                  v-if="isAdmin"
                  class="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
                  @click="navigateTo(`/pipeline/${run.id}?as=team`); openMenuId = null"
                >
                  Zobrazit jako obchodní tým
                </button>
              </div>
            </div>
          </div>
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
              v-if="run.stats[def.key] !== null && !(run.mode === 'short' && (def.key === 'competitions' || def.key === 'partners'))"
              class="text-xs text-gray-500 tabular-nums"
              :title="def.tooltip"
            >
              <span class="font-semibold text-gray-800">{{ run.stats[def.key] }}</span>
              {{ def.label }}
            </span>
          </template>
          <span
            v-if="STAT_DEFS.every(d => run.stats[d.key] === null || (run.mode === 'short' && (d.key === 'competitions' || d.key === 'partners')))"
            class="text-xs text-gray-400"
          >Zatím nebyly spuštěny žádné kroky</span>
        </div>
      </NuxtLink>
    </div>

    <!-- Create modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showCreateModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          @click.self="closeCreateModal"
        >
          <form
            class="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-5 space-y-4"
            @submit.prevent="createRun"
          >
            <h3 class="font-semibold text-gray-800">Nová pipeline</h3>

            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
              <input
                v-model="newName"
                type="text"
                placeholder="Název nové pipeline…"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
                autofocus
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Typ pipeline</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 py-2.5 px-3 rounded-lg border text-left text-sm transition-colors"
                  :class="newMode === 'full'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                  @click="newMode = 'full'"
                >
                  <span class="block font-medium">Úplná</span>
                  <span class="block text-[11px] font-normal mt-1 leading-snug opacity-80">
                    Všechny kroky od skenování trhu a identifikace partnerů až po oslovení.
                  </span>
                </button>
                <button
                  type="button"
                  class="flex-1 py-2.5 px-3 rounded-lg border text-left text-sm transition-colors"
                  :class="newMode === 'short'
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                  @click="newMode = 'short'"
                >
                  <span class="block font-medium">Zkrácená</span>
                  <span class="block text-[11px] font-normal mt-1 leading-snug opacity-80">
                    Přeskočí skenování a identifikaci — začínáte s partnery, které už máte.
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Viditelnost</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 py-2.5 px-3 rounded-lg border text-left text-sm transition-colors"
                  :class="newVisibility === 'private'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                  @click="newVisibility = 'private'"
                >
                  <span class="block font-medium">Soukromá</span>
                  <span class="block text-[11px] font-normal mt-1 leading-snug opacity-80">
                    Vidíte ji pouze vy — ostatní v projektu ji neuvidí.
                  </span>
                </button>
                <button
                  type="button"
                  class="flex-1 py-2.5 px-3 rounded-lg border text-left text-sm transition-colors"
                  :class="newVisibility === 'public'
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                  @click="newVisibility = 'public'"
                >
                  <span class="block font-medium">Veřejná</span>
                  <span class="block text-[11px] font-normal mt-1 leading-snug opacity-80">
                    Sdílená v rámci projektu — vidí ji všichni s přístupem.
                  </span>
                </button>
              </div>
            </div>

            <p v-if="createErrorMessage" class="text-sm text-red-600">{{ createErrorMessage }}</p>

            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                :disabled="creating"
                @click="closeCreateModal"
              >
                Zrušit
              </button>
              <button
                type="submit"
                :disabled="creating || !newName.trim()"
                class="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {{ creating ? 'Vytváření…' : 'Vytvořit' }}
              </button>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>

    <!-- Edit modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="editingRun"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          @click.self="editingRun = null"
        >
          <form
            class="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-sm p-5 space-y-4"
            @submit.prevent="saveEdit"
          >
            <h3 class="font-semibold text-gray-800 text-sm">Upravit pipeline</h3>

            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
              <input
                v-model="editName"
                type="text"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Viditelnost</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors"
                  :class="editVisibility === 'private'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'"
                  @click="editVisibility = 'private'"
                >
                  <span class="block">Soukromá</span>
                  <span class="block text-[10px] font-normal mt-0.5 opacity-70">Pouze autor</span>
                </button>
                <button
                  type="button"
                  class="flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors"
                  :class="editVisibility === 'public'
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'"
                  @click="editVisibility = 'public'"
                >
                  <span class="block">Veřejná</span>
                  <span class="block text-[10px] font-normal mt-0.5 opacity-70">Sdílená v projektu</span>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <button
                type="button"
                :disabled="editDeleting"
                class="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                @click="deleteRun"
              >
                {{ editDeleting ? 'Mazání…' : 'Smazat' }}
              </button>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  @click="editingRun = null"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  :disabled="editSaving || !editName.trim()"
                  class="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {{ editSaving ? 'Ukládání…' : 'Uložit' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
