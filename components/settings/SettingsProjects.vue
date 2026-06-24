<script setup lang="ts">
import type { GroupInfo } from '~/utils/settings-constants'

const props = defineProps<{ adminGroups: GroupInfo[] | null }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const selectedGroupId = ref('')
const editingProject = ref<{ id: string; groupId: string } | null>(null)
const form = ref({ name: '', slug: '' })
const saving = ref(false)
const deleting = ref(false)

function openCreate(groupId: string) {
  modalMode.value = 'create'
  selectedGroupId.value = groupId
  editingProject.value = null
  form.value = { name: '', slug: '' }
  showModal.value = true
}

function openEdit(project: { id: string; name: string; slug: string }, groupId: string) {
  modalMode.value = 'edit'
  selectedGroupId.value = groupId
  editingProject.value = { id: project.id, groupId }
  form.value = { name: project.name, slug: project.slug }
  showModal.value = true
}

watch(() => form.value.name, (name) => {
  if (modalMode.value === 'create') {
    form.value.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }
})

async function save() {
  saving.value = true
  try {
    if (editingProject.value) {
      await $fetch(`/api/admin/groups/${editingProject.value.groupId}/projects/${editingProject.value.id}`, {
        method: 'PATCH',
        body: { name: form.value.name.trim() },
      })
    } else {
      await $fetch(`/api/admin/groups/${selectedGroupId.value}/projects`, {
        method: 'POST',
        body: { name: form.value.name.trim(), slug: form.value.slug.trim() },
      })
    }
    emit('refresh')
    showModal.value = false
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? 'Nepodařilo se uložit.')
  } finally {
    saving.value = false
  }
}

async function deleteProject() {
  if (!editingProject.value) return
  if (!confirm('Opravdu chcete smazat tento projekt? Budou smazány všechny pipeline, knihovní položky a další data projektu. Tato akce je nevratná.')) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/groups/${editingProject.value.groupId}/projects/${editingProject.value.id}`, {
      method: 'DELETE',
    })
    emit('refresh')
    showModal.value = false
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? 'Nepodařilo se smazat.')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-for="group in adminGroups"
      :key="group.id"
      class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span class="w-3 h-3 rounded-full shrink-0" :style="`background: ${group.color}`" />
          <div>
            <h2 class="text-base font-semibold text-gray-800">{{ group.name }}</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ group.projects.length }} {{ group.projects.length === 1 ? 'projekt' : group.projects.length < 5 ? 'projekty' : 'projektů' }}</p>
          </div>
        </div>
        <button
          class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
          @click="openCreate(group.id)"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
          Nový projekt
        </button>
      </div>

      <div v-if="group.projects.length === 0" class="py-12 text-center text-gray-400 text-sm">
        Žádné projekty v této skupině.
      </div>

      <div v-else class="divide-y divide-gray-50">
        <div
          v-for="project in group.projects"
          :key="project.id"
          class="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-800 text-sm">{{ project.name }}</div>
            <div class="text-xs text-gray-400 mt-0.5">{{ project.slug }}</div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              class="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors font-medium"
              @click="openEdit(project, group.id)"
            >Upravit</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!adminGroups || adminGroups.length === 0" class="py-16 text-center text-gray-400 text-sm">
      Žádné typy projektů.
    </div>
  </div>

  <!-- Project modal -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">{{ modalMode === 'edit' ? 'Upravit projekt' : 'Nový projekt' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 transition-colors" @click="showModal = false">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">Název</label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="Název projektu"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div v-if="modalMode === 'create'">
            <label class="block text-xs font-semibold text-gray-500 mb-1.5">Slug</label>
            <input
              v-model="form.slug"
              type="text"
              required
              placeholder="url-slug"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p class="text-[11px] text-gray-400 mt-1">Unikátní identifikátor, malá písmena a pomlčky.</p>
          </div>

          <div v-if="modalMode === 'edit'" class="text-xs text-gray-400">
            Slug: <code class="bg-gray-50 px-1 rounded">{{ form.slug }}</code>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex items-center" :class="modalMode === 'edit' ? 'justify-between' : 'justify-end'">
          <button
            v-if="modalMode === 'edit'"
            type="button"
            :disabled="deleting"
            class="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium disabled:opacity-50"
            @click="deleteProject"
          >{{ deleting ? 'Mazání…' : 'Smazat projekt' }}</button>

          <div class="flex gap-2">
            <button class="text-sm text-gray-400 hover:text-gray-600 px-3 transition-colors" @click="showModal = false">Zrušit</button>
            <button
              :disabled="saving || !form.name.trim() || (modalMode === 'create' && !form.slug.trim())"
              class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              @click="save"
            >{{ saving ? 'Ukládám…' : 'Uložit' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
