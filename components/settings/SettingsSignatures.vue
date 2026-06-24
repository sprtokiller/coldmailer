<script setup lang="ts">
import { sanitizeHtml } from '~/utils/html-normalize'
interface SignatureItem {
  id: string
  name: string
  content: string
  isDefault: boolean
  isSystem: boolean
  author?: { id: string; name: string; image: string | null }
}

const { groupFont } = useActiveProject()
const { data: signatures, refresh } = await useFetch<SignatureItem[]>('/api/library/signatures', { default: () => [] })

const templates = computed(() => signatures.value.filter(s => s.isSystem))
const personal = computed(() => signatures.value.filter(s => !s.isSystem))

const editing = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formContent = ref('')
const formIsDefault = ref(false)
const saving = ref(false)

function startNew() {
  editingId.value = null
  formName.value = ''
  formContent.value = ''
  formIsDefault.value = false
  editing.value = true
}

function startFromTemplate(t: SignatureItem) {
  editingId.value = null
  formName.value = t.name + ' (moje kopie)'
  formContent.value = t.content
  formIsDefault.value = false
  editing.value = true
}

function startEdit(s: SignatureItem) {
  editingId.value = s.id
  formName.value = s.name
  formContent.value = s.content
  formIsDefault.value = s.isDefault
  editing.value = true
}

function cancel() {
  editing.value = false
}

async function save() {
  if (!formName.value.trim() || saving.value) return
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/library/signatures/${editingId.value}`, {
        method: 'PATCH',
        body: { name: formName.value.trim(), content: formContent.value, isDefault: formIsDefault.value },
      })
    } else {
      await $fetch('/api/library/signatures', {
        method: 'POST',
        body: { name: formName.value.trim(), content: formContent.value, isDefault: formIsDefault.value },
      })
    }
    editing.value = false
    await refresh()
  } catch (err: any) {
    alert(err?.data?.message || err?.message || 'Nepodařilo se uložit podpis.')
  } finally {
    saving.value = false
  }
}

async function setDefault(id: string) {
  try {
    await $fetch(`/api/library/signatures/${id}`, {
      method: 'PATCH',
      body: { isDefault: true },
    })
    await refresh()
  } catch (err: any) {
    alert(err?.data?.message || err?.message || 'Nepodařilo se nastavit výchozí podpis.')
  }
}

async function deleteSignature(id: string) {
  if (!confirm('Opravdu smazat tento podpis?')) return
  try {
    await $fetch(`/api/library/signatures/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (err: any) {
    alert(err?.data?.message || err?.message || 'Nepodařilo se smazat podpis.')
  }
}
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

      <label class="block text-xs font-medium text-gray-500 mb-1">Obsah podpisu</label>
      <RichTextEditor v-model="formContent" :default-font="groupFont" />

      <div class="flex items-center gap-4 mt-3">
        <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input v-model="formIsDefault" type="checkbox" class="accent-primary" />
          Nastavit jako výchozí
        </label>
      </div>

      <div class="flex gap-2 mt-4 justify-end">
        <button class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2" @click="cancel">Zrušit</button>
        <button
          class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="!formName.trim() || saving"
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
              <span v-if="t.author" class="text-[10px] text-gray-400 ml-2">{{ t.author.name }}</span>
            </div>
            <button
              class="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium shrink-0"
              @click="startFromTemplate(t)"
            >Použít jako základ</button>
          </div>
          <ClientOnly><div class="text-xs text-gray-600 leading-relaxed max-h-24 overflow-hidden" v-html="sanitizeHtml(t.content)" /></ClientOnly>
        </div>
      </div>
    </div>

    <!-- Personal signatures -->
    <div v-if="!editing">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Moje podpisy</h3>
      <div v-if="personal.length === 0" class="text-sm text-gray-400 py-4">
        Zatím nemáte žádný vlastní podpis. Vytvořte si nový nebo použijte šablonu výše.
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="s in personal"
          :key="s.id"
          class="bg-white rounded-xl border shadow-sm p-4"
          :class="s.isDefault ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-100'"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-800">{{ s.name }}</span>
              <span v-if="s.isDefault" class="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">výchozí</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="!s.isDefault"
                class="text-[10px] text-gray-400 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                title="Nastavit jako výchozí"
                @click="setDefault(s.id)"
              >⭐</button>
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
          <ClientOnly><div class="text-xs text-gray-600 leading-relaxed max-h-24 overflow-hidden" v-html="sanitizeHtml(s.content)" /></ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
