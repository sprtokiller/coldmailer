<script setup lang="ts">
const props = defineProps<{
  globalRecordId: string
  unknownContacts: Map<string, unknown[]>
}>()

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()

const CONTACT_TYPE_OPTIONS = ['Partnerships', 'PR', 'HR', 'Marketing', 'CEO', 'General']

const unknownContactActionLoading = ref<string | null>(null)

async function handleUnknownContactAction(action: 'blacklist' | 'save_local' | 'add_contact', email: string, extra?: { firstName?: string; lastName?: string; role?: string; contactType?: string; note?: string }) {
  unknownContactActionLoading.value = email
  try {
    await $fetch(`/api/partners/${props.globalRecordId}/unknown-contact-action`, {
      method: 'POST',
      body: { action, email, ...extra },
    })
    if (action === 'add_contact') toast.show('Kontakt uložen globálně', 'success')
    else if (action === 'save_local') toast.show('Adresa uložena mezi přídavné adresy', 'success')
    else if (action === 'blacklist') toast.show('Kontakt přidán na blacklist', 'success')
    emit('changed')
  } finally {
    unknownContactActionLoading.value = null
  }
}

const addContactForm = ref<{ email: string; firstName: string; lastName: string; role: string; contactType: string; note: string } | null>(null)

function openAddContactForm(email: string) {
  addContactForm.value = { email, firstName: '', lastName: '', role: '', contactType: 'General', note: '' }
}

async function submitAddContact() {
  if (!addContactForm.value) return
  await handleUnknownContactAction('add_contact', addContactForm.value.email, {
    firstName: addContactForm.value.firstName || undefined,
    lastName: addContactForm.value.lastName || undefined,
    role: addContactForm.value.role || undefined,
    contactType: addContactForm.value.contactType || undefined,
    note: addContactForm.value.note || undefined,
  })
  addContactForm.value = null
}
</script>

<template>
  <div
    v-for="[email, emails] of unknownContacts"
    :key="email"
    class="bg-amber-50 border border-amber-200 rounded-xl p-4"
  >
    <div class="flex items-start gap-3">
      <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-amber-800">
          Neznámý kontakt: <span class="font-mono">{{ email }}</span>
        </p>
        <p class="text-xs text-amber-600 mt-0.5">
          Nalezeno {{ emails.length }} {{ emails.length === 1 ? 'email' : emails.length < 5 ? 'emaily' : 'emailů' }} se shodnou doménou.
          Je to validní kontakt pro toto jednání?
        </p>

        <!-- Add contact globally inline form -->
        <div v-if="addContactForm?.email === email" class="mt-3 bg-white border border-amber-100 rounded-lg p-3 space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <input v-model="addContactForm.firstName" type="text" placeholder="Jméno" class="text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
            <input v-model="addContactForm.lastName" type="text" placeholder="Příjmení" class="text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
            <input v-model="addContactForm.role" type="text" placeholder="Pozice" class="text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
            <select v-model="addContactForm.contactType" class="text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300 bg-white">
              <option v-for="t in CONTACT_TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
            </select>
            <input v-model="addContactForm.note" type="text" placeholder="Poznámka" class="col-span-2 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
          </div>
          <div class="flex justify-end gap-2">
            <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="addContactForm = null">Zrušit</button>
            <button
              :disabled="unknownContactActionLoading === email"
              class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              @click="submitAddContact"
            >Uložit globálně</button>
          </div>
        </div>

        <!-- Action buttons -->
        <div v-else class="flex items-center gap-2 mt-3">
          <button
            :disabled="unknownContactActionLoading === email"
            class="text-xs px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 transition-colors"
            @click="handleUnknownContactAction('blacklist', email)"
          >Ne</button>
          <button
            :disabled="unknownContactActionLoading === email"
            class="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            @click="handleUnknownContactAction('save_local', email)"
          >Uložit</button>
          <button
            :disabled="unknownContactActionLoading === email"
            class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            @click="openAddContactForm(email)"
          >Uložit globálně</button>
          <svg v-if="unknownContactActionLoading === email" class="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        </div>
      </div>
    </div>
  </div>
</template>
