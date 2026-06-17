<script setup lang="ts">
const industryTags = ref<string[]>([])
const industryTagsLoading = ref(false)
const newTag = ref('')

async function fetchTags() {
  industryTagsLoading.value = true
  try {
    const data = await $fetch<{ tags: string[] }>('/api/admin/tags')
    industryTags.value = data.tags
  } finally {
    industryTagsLoading.value = false
  }
}

async function saveTags(tags: string[]) {
  const data = await $fetch<{ tags: string[] }>('/api/admin/tags', { method: 'PUT', body: { tags } })
  industryTags.value = data.tags
}

function addTag() {
  const tag = newTag.value.trim()
  if (!tag || industryTags.value.includes(tag)) return
  saveTags([...industryTags.value, tag])
  newTag.value = ''
}

function removeTag(tag: string) {
  saveTags(industryTags.value.filter(t => t !== tag))
}

onMounted(() => fetchTags())
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-gray-100">
        <h2 class="text-base font-semibold text-gray-800">Odvětví partnerů</h2>
        <p class="text-sm text-gray-400 mt-1">Kanonický seznam odvětví, ze kterého AI vybírá při profilování partnerů.</p>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="flex flex-wrap gap-2">
          <span
            v-for="tag in industryTags" :key="tag"
            class="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium"
          >
            {{ tag }}
            <button
              type="button"
              class="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-200 transition-colors text-indigo-400 hover:text-indigo-700"
              @click="removeTag(tag)"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </span>
          <span v-if="industryTags.length === 0 && !industryTagsLoading" class="text-sm text-gray-400 py-1.5">Zatím žádné štítky</span>
        </div>
        <form class="flex gap-2" @submit.prevent="addTag">
          <input
            v-model="newTag"
            type="text"
            placeholder="Nové odvětví..."
            class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            @keydown.enter.prevent="addTag"
          />
          <button
            type="submit"
            :disabled="!newTag.trim()"
            class="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
          >Přidat</button>
        </form>
      </div>
    </div>
  </div>
</template>
