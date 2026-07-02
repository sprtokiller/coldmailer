<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

const props = withDefaults(defineProps<{
  editor: Editor | undefined
  txCounter: number
  htmlMode: boolean
  defaultFont?: string
}>(), { defaultFont: '' })

const emit = defineEmits<{
  (e: 'toggleHtmlMode'): void
  (e: 'openLinkPopover'): void
}>()

// ── State ──────────────────────────────────────────────────────────────────
const showColorPopover = ref(false)
const showMoreMenu = ref(false)
const colorPopoverRef = ref<HTMLElement | null>(null)
const moreMenuRef = ref<HTMLElement | null>(null)

// ── Font options ───────────────────────────────────────────────────────────
const customFonts = [
  { label: 'Sans Serif (TdA)', value: 'sans-serif' },
  { label: 'Dosis (XO)', value: 'Dosis' },
  { label: 'Figtree (PPT)', value: 'Figtree' },
]
const standardFonts = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
  { label: 'Verdana', value: 'Verdana' },
]
const fontSizes = ['10px', '11px', '12px', '14px', '16px', '18px', '24px', '36px']

// ── Color palettes ─────────────────────────────────────────────────────────
const fgColors = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff']
const bgColors = ['transparent', '#ffff00', '#ff9900', '#ff0000', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e4f7', '#cfe2f3', '#d9d2e9']

// ── Computed current state (reactive via txCounter) ───────────────────────
const currentFont = computed(() => {
  props.txCounter
  if (!props.editor) return props.defaultFont
  const attrs = props.editor.getAttributes('textStyle')
  const ff = (attrs.fontFamily as string) ?? ''
  return ff.replace(/^["']|["']$/g, '') || props.defaultFont
})

const currentSize = computed(() => {
  props.txCounter
  if (!props.editor) return ''
  const attrs = props.editor.getAttributes('textStyle')
  return (attrs.fontSize as string) ?? ''
})

const currentFgColor = computed(() => {
  props.txCounter
  if (!props.editor) return '#000000'
  const attrs = props.editor.getAttributes('textStyle')
  return (attrs.color as string) ?? '#000000'
})

const isLinkActive = computed(() => {
  props.txCounter
  return props.editor?.isActive('link') ?? false
})

function currentFontLabel(fontValue: string) {
  if (!fontValue) return ''
  const all = [...customFonts, ...standardFonts]
  return all.find(f => f.value === fontValue)?.label ?? fontValue
}

function currentSizeLabel(sizeValue: string) {
  if (!sizeValue) return ''
  return sizeValue.replace('px', '')
}

// ── Toolbar actions ────────────────────────────────────────────────────────
function setFont(font: string) {
  props.editor?.chain().focus().setFontFamily(font).run()
}

function setSize(size: string) {
  props.editor?.chain().focus().setFontSize(size).run()
}

function setFgColor(color: string) {
  props.editor?.chain().focus().setColor(color).run()
}

function setBgColor(color: string) {
  if (color === 'transparent') {
    props.editor?.chain().focus().unsetHighlight().run()
  } else {
    props.editor?.chain().focus().setHighlight({ color }).run()
  }
}

function onNativeFgColor(e: Event) {
  setFgColor((e.target as HTMLInputElement).value)
}

function onNativeBgColor(e: Event) {
  setBgColor((e.target as HTMLInputElement).value)
}

// ── Close popovers on outside click ──────────────────────────────────────
function onDocumentClick(e: MouseEvent) {
  if (colorPopoverRef.value && !colorPopoverRef.value.contains(e.target as Node))
    showColorPopover.value = false
  if (moreMenuRef.value && !moreMenuRef.value.contains(e.target as Node))
    showMoreMenu.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
})

defineExpose({ isLinkActive })
</script>

<template>
  <div class="border-t border-gray-200 bg-gray-50 px-2 py-1.5 flex items-center gap-0.5 flex-wrap">

    <!-- Group 1: Undo / Redo -->
    <button
      type="button"
      title="Zpět"
      class="toolbar-btn"
      :class="{ 'opacity-40 cursor-not-allowed': !editor?.can().undo() }"
      @click="editor?.chain().focus().undo().run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v6h6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 13C5.5 7.5 10 5 15 5a9 9 0 0 1 6 10" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button
      type="button"
      title="Vpřed"
      class="toolbar-btn"
      :class="{ 'opacity-40 cursor-not-allowed': !editor?.can().redo() }"
      @click="editor?.chain().focus().redo().run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 7v6h-6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 13C18.5 7.5 14 5 9 5a9 9 0 0 0-6 10" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="toolbar-sep" />

    <!-- Group 2: Font family -->
    <select
      title="Rodina písma"
      class="toolbar-select w-32"
      :value="currentFont"
      @change="setFont(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ currentFontLabel(currentFont) || 'Písmo' }}</option>
      <optgroup label="Vlastní">
        <option v-for="f in customFonts" :key="f.value" :value="f.value">{{ f.label }}</option>
      </optgroup>
      <optgroup label="Běžné">
        <option v-for="f in standardFonts" :key="f.value" :value="f.value">{{ f.label }}</option>
      </optgroup>
    </select>

    <!-- Group 2: Font size -->
    <select
      title="Velikost písma"
      class="toolbar-select w-14"
      :value="currentSize"
      @change="setSize(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ currentSizeLabel(currentSize) || 'Vel.' }}</option>
      <option v-for="s in fontSizes" :key="s" :value="s">{{ s.replace('px', '') }}</option>
    </select>

    <div class="toolbar-sep" />

    <!-- Group 3: Bold / Italic / Underline -->
    <button
      type="button"
      title="Tučné"
      class="toolbar-btn font-bold"
      :class="{ 'bg-gray-200': editor?.isActive('bold') }"
      @click="editor?.chain().focus().toggleBold().run()"
    >B</button>
    <button
      type="button"
      title="Kurzíva"
      class="toolbar-btn italic"
      :class="{ 'bg-gray-200': editor?.isActive('italic') }"
      @click="editor?.chain().focus().toggleItalic().run()"
    >I</button>
    <button
      type="button"
      title="Podtržení"
      class="toolbar-btn underline"
      :class="{ 'bg-gray-200': editor?.isActive('underline') }"
      @click="editor?.chain().focus().toggleUnderline().run()"
    >U</button>

    <div class="toolbar-sep" />

    <!-- Group 4: Color -->
    <div ref="colorPopoverRef" class="relative">
      <button
        type="button"
        title="Barva textu / pozadí"
        class="toolbar-btn flex flex-col items-center gap-0.5 px-1.5"
        @click.stop="showColorPopover = !showColorPopover; showMoreMenu = false"
      >
        <span class="text-xs font-bold leading-none">A</span>
        <span class="w-4 h-0.5 rounded-full" :style="{ backgroundColor: currentFgColor }" />
      </button>

      <div
        v-show="showColorPopover"
        class="absolute bottom-full left-0 mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-56"
      >
        <p class="text-[10px] font-medium text-gray-500 mb-1.5">Barva textu</p>
        <div class="grid grid-cols-8 gap-1 mb-2">
          <button
            v-for="c in fgColors"
            :key="c"
            type="button"
            class="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="setFgColor(c)"
          />
          <label class="w-5 h-5 rounded-full border border-gray-200 cursor-pointer overflow-hidden hover:scale-110 transition-transform" title="Vlastní barva textu">
            <input type="color" class="opacity-0 w-0 h-0" @input="onNativeFgColor" />
            <span class="flex items-center justify-center w-full h-full text-[9px]">+</span>
          </label>
        </div>

        <p class="text-[10px] font-medium text-gray-500 mb-1.5">Barva pozadí</p>
        <div class="grid grid-cols-8 gap-1">
          <button
            v-for="c in bgColors"
            :key="c"
            type="button"
            class="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
            :style="{ backgroundColor: c === 'transparent' ? 'white' : c }"
            :title="c === 'transparent' ? 'Bez barvy' : c"
            @click="setBgColor(c)"
          >
            <span v-if="c === 'transparent'" class="text-[8px] text-gray-400">∅</span>
          </button>
          <label class="w-5 h-5 rounded-full border border-gray-200 cursor-pointer overflow-hidden hover:scale-110 transition-transform" title="Vlastní barva pozadí">
            <input type="color" class="opacity-0 w-0 h-0" @input="onNativeBgColor" />
            <span class="flex items-center justify-center w-full h-full text-[9px]">+</span>
          </label>
        </div>
      </div>
    </div>

    <div class="toolbar-sep" />

    <!-- Group 5: Link -->
    <button
      type="button"
      title="Odkaz (Ctrl+K)"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': isLinkActive }"
      @click="$emit('openLinkPopover')"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="toolbar-sep" />

    <!-- Group 6: Alignment -->
    <button
      type="button"
      title="Zarovnat vlevo"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': editor?.isActive({ textAlign: 'left' }) }"
      @click="editor?.chain().focus().setTextAlign('left').run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
      </svg>
    </button>
    <button
      type="button"
      title="Zarovnat na střed"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': editor?.isActive({ textAlign: 'center' }) }"
      @click="editor?.chain().focus().setTextAlign('center').run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    </button>
    <button
      type="button"
      title="Zarovnat vpravo"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': editor?.isActive({ textAlign: 'right' }) }"
      @click="editor?.chain().focus().setTextAlign('right').run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    <div class="toolbar-sep" />

    <!-- Group 7: Lists -->
    <button
      type="button"
      title="Číslovaný seznam"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': editor?.isActive('orderedList') }"
      @click="editor?.chain().focus().toggleOrderedList().run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
        <text x="2" y="8" font-size="7" fill="currentColor" stroke="none">1.</text>
        <text x="2" y="14" font-size="7" fill="currentColor" stroke="none">2.</text>
        <text x="2" y="20" font-size="7" fill="currentColor" stroke="none">3.</text>
      </svg>
    </button>
    <button
      type="button"
      title="Odrážkový seznam"
      class="toolbar-btn"
      :class="{ 'bg-gray-200': editor?.isActive('bulletList') }"
      @click="editor?.chain().focus().toggleBulletList().run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
        <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <!-- Indent -->
    <button
      type="button"
      title="Méně odsazení"
      class="toolbar-btn"
      @click="editor?.chain().focus().liftListItem('listItem').run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="7 8 3 12 7 16" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="6" x2="11" y2="6" /><line x1="21" y1="18" x2="11" y2="18" />
      </svg>
    </button>
    <button
      type="button"
      title="Více odsazení"
      class="toolbar-btn"
      @click="editor?.chain().focus().sinkListItem('listItem').run()"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 8 21 12 17 16" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="3" y1="12" x2="13" y2="12" /><line x1="3" y1="6" x2="13" y2="6" /><line x1="3" y1="18" x2="13" y2="18" />
      </svg>
    </button>

    <div class="toolbar-sep" />

    <!-- Group 8: More -->
    <div ref="moreMenuRef" class="relative">
      <button
        type="button"
        title="Více možností"
        class="toolbar-btn"
        :class="{ 'bg-gray-200': showMoreMenu }"
        @click.stop="showMoreMenu = !showMoreMenu; showColorPopover = false"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      <div
        v-show="showMoreMenu"
        class="absolute bottom-full right-0 mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44"
      >
        <button
          type="button"
          class="more-item"
          :class="{ 'bg-gray-100': editor?.isActive('strike') }"
          title="Přeškrtnutí"
          @click="editor?.chain().focus().toggleStrike().run(); showMoreMenu = false"
        >
          <s>Přeškrtnutí</s>
        </button>
        <button
          type="button"
          class="more-item"
          title="Vymazat formátování"
          @click="editor?.chain().focus().clearNodes().unsetAllMarks().run(); showMoreMenu = false"
        >
          Vymazat formátování
        </button>
        <button
          type="button"
          class="more-item"
          :class="{ 'bg-gray-100': editor?.isActive('blockquote') }"
          title="Citace"
          @click="editor?.chain().focus().toggleBlockquote().run(); showMoreMenu = false"
        >
          Citace
        </button>
      </div>
    </div>

    <div class="toolbar-sep" />

    <!-- Group 9: HTML source toggle -->
    <button
      type="button"
      :title="htmlMode ? 'Vizuální režim' : 'Zdrojový kód'"
      class="toolbar-btn px-1.5 font-mono text-[11px]"
      :class="{ 'bg-gray-200': htmlMode }"
      @click="emit('toggleHtmlMode')"
    >&lt;/&gt;</button>

  </div>
</template>

<style scoped>
.toolbar-btn {
  @apply flex items-center justify-center w-7 h-7 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors text-sm cursor-pointer select-none;
}

.toolbar-sep {
  @apply w-px h-5 bg-gray-300 mx-1 flex-shrink-0;
}

.toolbar-select {
  @apply h-7 text-xs border border-gray-200 rounded-lg px-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer;
}

.more-item {
  @apply w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors;
}
</style>
