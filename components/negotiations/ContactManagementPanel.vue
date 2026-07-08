<script setup lang="ts">
const props = defineProps<{
  globalRecordId: string
  detectedDomain: string | null
  autoIncludeDomain: boolean
  blacklist: string[]
  additionalAddresses: string[]
}>()

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()

async function patchSettings(body: Record<string, unknown>) {
  await $fetch(`/api/partners/${props.globalRecordId}/settings`, { method: 'PATCH', body })
  emit('changed')
}

async function toggleAutoIncludeDomain() {
  await patchSettings({ autoIncludeDomain: !props.autoIncludeDomain })
}

// ── Blacklist ────────────────────────────────────────────────────────────────

const showBlacklist = ref(false)
const newBlacklistEmail = ref('')
const blacklistError = ref('')

async function addToBlacklist() {
  blacklistError.value = ''
  const email = newBlacklistEmail.value.trim().toLowerCase()
  if (!email) return
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    blacklistError.value = `${email} nevypadá jako platná e-mailová adresa.`
    return
  }
  if (props.blacklist.includes(email)) {
    blacklistError.value = `${email} už je na blacklistu.`
    return
  }
  if (props.additionalAddresses.includes(email)) {
    blacklistError.value = `${email} je v přídavných adresách — nejprve ji odeberte.`
    return
  }
  await patchSettings({ contactBlacklist: [...props.blacklist, email] })
  newBlacklistEmail.value = ''
  toast.show(`${email} přidán na blacklist`, 'success')
}

async function removeFromBlacklist(email: string) {
  const updated = props.blacklist.filter(e => e !== email)
  await patchSettings({ contactBlacklist: updated.length ? updated : null })
  toast.show(`${email} odebrán z blacklistu`, 'success')
}

// ── Additional addresses (whitelist) ─────────────────────────────────────────

const showAdditionalAddresses = ref(false)
const newAdditionalEmail = ref('')
const additionalError = ref('')

async function addAdditionalAddress() {
  additionalError.value = ''
  const email = newAdditionalEmail.value.trim().toLowerCase()
  if (!email) return
  if (props.blacklist.includes(email)) {
    additionalError.value = `${email} je na blacklistu — nejprve ji odeberte.`
    return
  }
  await patchSettings({ additionalAddresses: [...props.additionalAddresses, email] })
  newAdditionalEmail.value = ''
  toast.show(`${email} přidán mezi přídavné adresy`, 'success')
}

async function removeAdditionalAddress(email: string) {
  const updated = props.additionalAddresses.filter(e => e !== email)
  await patchSettings({ additionalAddresses: updated.length ? updated : null })
  toast.show(`${email} odebrán z přídavných adres`, 'success')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Auto-include domain toggle -->
    <div v-if="detectedDomain" class="flex items-center justify-between gap-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
      <div class="flex items-center gap-3 min-w-0">
        <div>
          <p class="text-xs font-medium text-gray-700">Automaticky zahrnout doménu</p>
          <p class="text-[11px] text-gray-400 mt-0.5">Sledovat emaily s doménou <span class="font-mono text-indigo-600">@{{ detectedDomain }}</span></p>
        </div>
      </div>
      <button
        :class="[
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
          autoIncludeDomain ? 'bg-indigo-600' : 'bg-gray-200'
        ]"
        role="switch"
        :aria-checked="autoIncludeDomain"
        @click="toggleAutoIncludeDomain"
      >
        <span
          :class="[
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
            autoIncludeDomain ? 'translate-x-4' : 'translate-x-0'
          ]"
        />
      </button>
    </div>

    <!-- Blacklist + Additional addresses side by side -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

      <!-- Blacklist -->
      <div>
        <button
          class="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2"
          @click="showBlacklist = !showBlacklist"
        >
          <span>{{ showBlacklist ? '▾' : '▸' }}</span>
          <span>Blacklist kontaktů{{ blacklist.length ? ` (${blacklist.length})` : '' }}</span>
        </button>
        <div v-if="showBlacklist" class="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p class="text-[11px] text-gray-400 mb-3">Blokuje se vždy celá e-mailová adresa (ne jen doména nebo jméno před @).</p>
          <div class="space-y-2 mb-4">
            <div
              v-for="email in blacklist"
              :key="email"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span class="font-mono text-gray-600 truncate">{{ email }}</span>
              <button
                class="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                @click="removeFromBlacklist(email)"
              >odebrat</button>
            </div>
            <p v-if="!blacklist.length" class="text-xs text-gray-400 italic">Žádné blokované adresy</p>
          </div>
          <p v-if="blacklistError" class="text-[11px] text-red-500 mb-2">{{ blacklistError }}</p>
          <div class="flex items-center gap-2">
            <input
              v-model="newBlacklistEmail"
              type="email"
              placeholder="email@example.com"
              class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-0"
              @keydown.enter="addToBlacklist"
            />
            <button
              class="text-sm px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex-shrink-0"
              @click="addToBlacklist"
            >Přidat</button>
          </div>
        </div>
      </div>

      <!-- Additional addresses -->
      <div>
        <button
          class="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2"
          @click="showAdditionalAddresses = !showAdditionalAddresses"
        >
          <span>{{ showAdditionalAddresses ? '▾' : '▸' }}</span>
          <span>Přídavné adresy{{ additionalAddresses.length ? ` (${additionalAddresses.length})` : '' }}</span>
        </button>
        <div v-if="showAdditionalAddresses" class="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p class="text-[11px] text-gray-400 mb-3">Emaily sledované v rámci tohoto projektu, ale nezapsané do globálního profilu partnera.</p>
          <div class="space-y-2 mb-4">
            <div
              v-for="email in additionalAddresses"
              :key="email"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span class="font-mono text-gray-600 truncate">{{ email }}</span>
              <button
                class="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                @click="removeAdditionalAddress(email)"
              >odebrat</button>
            </div>
            <p v-if="!additionalAddresses.length" class="text-xs text-gray-400 italic">Žádné přídavné adresy</p>
          </div>
          <p v-if="additionalError" class="text-[11px] text-red-500 mb-2">{{ additionalError }}</p>
          <div class="flex items-center gap-2">
            <input
              v-model="newAdditionalEmail"
              type="email"
              placeholder="email@example.com"
              class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-0"
              @keydown.enter="addAdditionalAddress"
            />
            <button
              class="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0"
              @click="addAdditionalAddress"
            >Přidat</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
