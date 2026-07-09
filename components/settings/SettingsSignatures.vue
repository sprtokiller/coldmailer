<script setup lang="ts">
import { sanitizeHtml } from '~/utils/html-normalize'
interface SignatureItem {
  id: string
  name: string
  content: string
  isTemplate: boolean
  groupId: string
  group: { id: string; name: string; color: string }
  author?: { id: string; name: string; image: string | null }
}

const toast = useToast()
const { groupFont, groups } = useActiveProject()
const { data: sigData, refresh } = await useFetch<{ templates: SignatureItem[]; personal: SignatureItem[] }>('/api/library/signatures', { default: () => ({ templates: [], personal: [] }) })

const templates = computed(() => sigData.value?.templates ?? [])
const personal = computed(() => sigData.value?.personal ?? [])

const editing = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formContent = ref('')
const formGroupId = ref('')
const saving = ref(false)

function startNew() {
  editingId.value = null
  formName.value = ''
  formContent.value = ''
  formGroupId.value = groups.value[0]?.id ?? ''
  editing.value = true
}

function startFromTemplate(t: SignatureItem) {
  editingId.value = null
  formName.value = t.name + ' (moje kopie)'
  formContent.value = t.content
  formGroupId.value = t.groupId
  editing.value = true
}

function startEdit(s: SignatureItem) {
  editingId.value = s.id
  formName.value = s.name
  formContent.value = s.content
  formGroupId.value = s.groupId
  editing.value = true
}

function cancel() {
  editing.value = false
}

async function save() {
  if (!formName.value.trim() || !formGroupId.value || saving.value) return
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/library/signatures/${editingId.value}`, {
        method: 'PATCH',
        body: { name: formName.value.trim(), content: formContent.value, groupId: formGroupId.value },
      })
    } else {
      await $fetch('/api/library/signatures', {
        method: 'POST',
        body: { name: formName.value.trim(), content: formContent.value, groupId: formGroupId.value },
      })
    }
    toast.show(editingId.value ? 'Podpis uložen' : 'Podpis vytvořen', 'success')
    editing.value = false
    await refresh()
  } catch (err: any) {
    toast.show(err?.data?.message || err?.message || 'Nepodařilo se uložit podpis', 'error')
  } finally {
    saving.value = false
  }
}

async function deleteSignature(id: string) {
  if (!confirm('Opravdu smazat tento podpis?')) return
  try {
    await $fetch(`/api/library/signatures/${id}`, { method: 'DELETE' })
    toast.show('Podpis smazán', 'success')
    await refresh()
  } catch (err: any) {
    toast.show(err?.data?.message || err?.message || 'Nepodařilo se smazat podpis', 'error')
  }
}

const personalByGroup = computed(() => {
  const map = new Map<string, { group: SignatureItem['group']; sigs: SignatureItem[] }>()
  for (const s of personal.value) {
    if (!map.has(s.groupId)) map.set(s.groupId, { group: s.group, sigs: [] })
    map.get(s.groupId)!.sigs.push(s)
  }
  return [...map.values()]
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-800">Můj podpis</h2>
        <p class="text-xs text-gray-400 mt-0.5">Vyberte si podpis ze šablon nebo vytvořte vlastní.</p>
      </div>
      <button
        v-if="!editing"
        class="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        @click="startNew"
      >+ Nový podpis</button>
    </div>

    <!-- Edit form -->
    <div v-if="editing" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
      <h3 class="text-sm font-semibold text-gray-800 mb-3">{{ editingId ? 'Upravit podpis' : 'Nový podpis' }}</h3>

      <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
      <input
        v-model="formName"
        type="text"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        placeholder="Např. Profesionální podpis"
      />

      <label class="block text-xs font-medium text-gray-500 mb-1">Typ projektu</label>
      <select
        v-model="formGroupId"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
      >
        <option value="">— vyberte typ projektu —</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>

      <label class="block text-xs font-medium text-gray-500 mb-1">Obsah podpisu</label>
      <RichTextEditor v-model="formContent" :default-font="groupFont" />

      <div class="flex gap-2 mt-4 justify-end">
        <button class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2" @click="cancel">Zrušit</button>
        <button
          class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="!formName.trim() || !formGroupId || saving"
          @click="save"
        >{{ saving ? 'Ukládám…' : editingId ? 'Uložit' : 'Vytvořit' }}</button>
      </div>
    </div>

    <!-- Templates -->
    <div v-if="templates.length > 0 && !editing" class="mb-6">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Šablony podpisů</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="t in templates"
          :key="t.id"
          class="bg-amber-50/50 rounded-xl border border-amber-200/50 p-4"
        >
          <div class="flex items-start justify-between mb-2">
            <div>
              <span class="text-sm font-medium text-gray-800">{{ t.name }}</span>
              <span
                v-if="t.group"
                class="text-[10px] px-1.5 py-0.5 rounded-full ml-2 font-medium"
                :style="{ background: t.group.color + '22', color: t.group.color }"
              >{{ t.group.name }}</span>
            </div>
            <button
              class="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium shrink-0"
              @click="startFromTemplate(t)"
            >Použít jako základ</button>
          </div>
          <ClientOnly>
            <div class="signature-preview text-xs text-gray-600 leading-relaxed max-h-[195px] overflow-y-auto" v-html="sanitizeHtml(t.content)" />
            <template #fallback>
              <div class="animate-pulse space-y-1.5">
                <div class="h-2.5 bg-amber-100/70 rounded w-5/6"></div>
                <div class="h-2.5 bg-amber-100/70 rounded w-2/3"></div>
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>

    <!-- Personal signatures grouped by project type -->
    <div v-if="!editing">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Moje podpisy</h3>
      <div v-if="personal.length === 0" class="flex flex-col items-center text-center gap-2 py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <svg class="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <p class="text-sm font-medium text-gray-600">Zatím nemáte žádný vlastní podpis</p>
        <button
          class="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity mt-1"
          @click="startNew"
        >+ Vytvořit podpis</button>
      </div>
      <div v-for="bucket in personalByGroup" :key="bucket.group.id" class="mb-4">
        <div
          class="text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5"
          :style="{ color: bucket.group.color }"
        >
          <span
            class="inline-block w-2 h-2 rounded-full"
            :style="{ background: bucket.group.color }"
          />
          {{ bucket.group.name }}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="s in bucket.sigs"
            :key="s.id"
            class="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
          >
            <div class="flex items-start justify-between mb-2">
              <span class="text-sm font-medium text-gray-800">{{ s.name }}</span>
              <div class="flex items-center gap-1">
                <button
                  class="text-[10px] text-gray-400 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                  @click="startEdit(s)"
                >Upravit</button>
                <button
                  class="text-[10px] text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded transition-colors"
                  @click="deleteSignature(s.id)"
                >Smazat</button>
              </div>
            </div>
            <ClientOnly>
              <div class="signature-preview text-xs text-gray-600 leading-relaxed max-h-[195px] overflow-y-auto" v-html="sanitizeHtml(s.content)" />
              <template #fallback>
                <div class="animate-pulse space-y-1.5">
                  <div class="h-2.5 bg-gray-100 rounded w-5/6"></div>
                  <div class="h-2.5 bg-gray-100 rounded w-2/3"></div>
                </div>
              </template>
            </ClientOnly>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signature-preview::-webkit-scrollbar { width: 4px; }
.signature-preview::-webkit-scrollbar-track { background: transparent; }
.signature-preview::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
</style>
