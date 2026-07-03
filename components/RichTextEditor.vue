<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Slice, Fragment } from '@tiptap/pm/model'
import { sanitizeAndNormalizeHtml, sanitizeHtml } from '~/utils/html-normalize'

const templateVarKey = new PluginKey('templateVariableHighlight')
const TemplateVariableHighlight = Extension.create({
  name: 'templateVariableHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: templateVarKey,
        state: {
          init(_, state) {
            return buildDecorations(state.doc)
          },
          apply(tr, old) {
            return tr.docChanged ? buildDecorations(tr.doc) : old
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})

function buildDecorations(doc: import('@tiptap/pm/model').Node): DecorationSet {
  const decorations: Decoration[] = []
  const re = /\{[^{}]+\}/g
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    let match: RegExpExecArray | null
    while ((match = re.exec(node.text)) !== null) {
      decorations.push(
        Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
          class: 'template-var',
        }),
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}

const props = withDefaults(defineProps<{ modelValue: string; placeholder?: string; defaultFont?: string; editable?: boolean }>(), { placeholder: '', defaultFont: '', editable: true })
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

// ── State ──────────────────────────────────────────────────────────────────
const editorWrapperRef = ref<HTMLElement | null>(null)
const htmlMode = ref(false)
const htmlSource = ref('')
const txCounter = ref(0)

// ── Link state ────────────────────────────────────────────────────────────
const showLinkPopover = ref(false)
const linkPopoverRef = ref<HTMLElement | null>(null)
const linkUrl = ref('')
const linkText = ref('')
const linkPopoverPos = ref({ top: '0px', left: '0px' })

const linkTooltip = reactive({ show: false, url: '', x: 0, y: 0 })
let tooltipTimer: ReturnType<typeof setTimeout> | null = null

const ctrlHeld = ref(false)

const toolbarRef = ref<InstanceType<typeof import('./RichTextToolbar.vue').default> | null>(null)

// ── Editor ─────────────────────────────────────────────────────────────────
const editor = useEditor({
  content: props.modelValue,
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ...(props.placeholder ? [Placeholder.configure({ placeholder: props.placeholder })] : []),
    TemplateVariableHighlight,
  ],
  editorProps: {
    transformPastedHTML(html) {
      return sanitizeHtml(html)
    },
    transformPasted(slice) {
      if (!props.defaultFont || !editor.value) return slice
      const markType = editor.value.schema.marks.textStyle
      if (!markType) return slice

      function addFontMark(fragment: Fragment): Fragment {
        const nodes: import('@tiptap/pm/model').Node[] = []
        fragment.forEach((node) => {
          if (node.isText) {
            const hasFont = node.marks.some((m) => m.type === markType && m.attrs.fontFamily)
            if (!hasFont) {
              const mark = markType.create({ fontFamily: props.defaultFont })
              nodes.push(node.mark(mark.addToSet(node.marks)))
            } else {
              nodes.push(node)
            }
          } else {
            nodes.push(node.copy(addFontMark(node.content)))
          }
        })
        return Fragment.from(nodes)
      }

      return new Slice(addFontMark(slice.content), slice.openStart, slice.openEnd)
    },
    handleKeyDown(_view, event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        openLinkPopover()
        return true
      }
      return false
    },
    handleClick(_view, _pos, event) {
      if (event.ctrlKey || event.metaKey) {
        const link = (event.target as HTMLElement).closest('a')
        if (link?.getAttribute('href')) {
          window.open(link.getAttribute('href')!, '_blank', 'noopener,noreferrer')
          return true
        }
      }
      return false
    },
    handleDOMEvents: {
      mouseover(_view, event) {
        const link = (event.target as HTMLElement).closest?.('a')
        if (link?.getAttribute('href')) {
          scheduleTooltip(link.getAttribute('href')!, event as MouseEvent)
        }
        return false
      },
      mouseout(_view, event) {
        const link = (event.target as HTMLElement).closest?.('a')
        if (link) clearTooltip()
        return false
      },
    },
  },
  onUpdate({ editor: e }) {
    emit('update:modelValue', e.getHTML())
    txCounter.value++
  },
  onSelectionUpdate() {
    txCounter.value++
  },
})

watch(
  () => props.modelValue,
  (val) => {
    if (!editor.value) return
    const current = editor.value.getHTML()
    if (val !== current) {
      editor.value.commands.setContent(val, { emitUpdate: false })
    }
  },
)

function applyDefaultFont() {
  const e = editor.value
  if (!e || !props.defaultFont) return
  const markType = e.schema.marks.textStyle
  if (!markType) return
  const mark = markType.create({ fontFamily: props.defaultFont })
  const { tr } = e.state
  tr.setStoredMarks([mark])
  e.view.dispatch(tr)
}

watch(
  () => props.defaultFont,
  () => { if (editor.value?.isEmpty) applyDefaultFont() },
)

watch(
  () => props.editable,
  (val) => { editor.value?.setEditable(val) },
)

onMounted(() => nextTick(applyDefaultFont))

onBeforeUnmount(() => editor.value?.destroy())

// ── Link popover ──────────────────────────────────────────────────────────
function openLinkPopover() {
  if (!editor.value) return

  const { from, to } = editor.value.state.selection
  const selectedText = editor.value.state.doc.textBetween(from, to, ' ')
  const linkAttrs = editor.value.getAttributes('link')

  linkText.value = selectedText || ''
  linkUrl.value = (linkAttrs.href as string) || ''

  const wrapperEl = editorWrapperRef.value
  if (wrapperEl) {
    const coords = editor.value.view.coordsAtPos(from)
    const rect = wrapperEl.getBoundingClientRect()
    linkPopoverPos.value = {
      top: `${coords.bottom - rect.top + 6}px`,
      left: `${Math.min(Math.max(0, coords.left - rect.left), rect.width - 300)}px`,
    }
  }

  showLinkPopover.value = true
  nextTick(() => {
    (linkPopoverRef.value?.querySelector('input[name="link-url"]') as HTMLInputElement)?.focus()
  })
}

function applyLink() {
  if (!editor.value) return

  let url = linkUrl.value.trim()
  if (!url) { removeLink(); return }

  if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:')) {
    url = 'https://' + url
  }

  const { from, to } = editor.value.state.selection
  const currentText = editor.value.state.doc.textBetween(from, to, ' ')
  const newText = linkText.value.trim()

  if (newText && newText !== currentText) {
    editor.value.chain()
      .focus()
      .deleteSelection()
      .insertContent({ type: 'text', text: newText, marks: [{ type: 'link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } }] })
      .run()
  } else if (from === to && newText) {
    editor.value.chain()
      .focus()
      .insertContent({ type: 'text', text: newText, marks: [{ type: 'link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } }] })
      .run()
  } else {
    editor.value.chain()
      .focus()
      .setLink({ href: url, target: '_blank' })
      .run()
  }

  showLinkPopover.value = false
}

function removeLink() {
  editor.value?.chain().focus().unsetLink().run()
  showLinkPopover.value = false
}

function onLinkKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); applyLink() }
  if (e.key === 'Escape') { showLinkPopover.value = false; editor.value?.commands.focus() }
}

// ── Link tooltip ──────────────────────────────────────────────────────────
function scheduleTooltip(url: string, event: MouseEvent) {
  clearTooltip()
  tooltipTimer = setTimeout(() => {
    const wrapperEl = editorWrapperRef.value
    if (!wrapperEl) return
    const rect = wrapperEl.getBoundingClientRect()
    linkTooltip.url = url
    linkTooltip.x = event.clientX - rect.left
    linkTooltip.y = event.clientY - rect.top + 20
    linkTooltip.show = true
  }, 500)
}

function clearTooltip() {
  if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null }
  linkTooltip.show = false
}

// ── Ctrl key tracking ──────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') ctrlHeld.value = true
}
function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') ctrlHeld.value = false
}
function onWindowBlur() { ctrlHeld.value = false }

function onDocumentClick(e: MouseEvent) {
  if (showLinkPopover.value && linkPopoverRef.value && !linkPopoverRef.value.contains(e.target as Node))
    showLinkPopover.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  clearTooltip()
})

// ── HTML source mode ──────────────────────────────────────────────────────
function toggleHtmlMode() {
  if (!htmlMode.value) {
    htmlSource.value = editor.value?.getHTML() ?? ''
    htmlMode.value = true
  } else {
    const safe = sanitizeHtml(htmlSource.value)
    editor.value?.commands.setContent(safe, { emitUpdate: false })
    emit('update:modelValue', editor.value?.getHTML() ?? safe)
    htmlMode.value = false
  }
}

function onHtmlSourceInput(e: Event) {
  htmlSource.value = (e.target as HTMLTextAreaElement).value
}

defineExpose({
  normalize() {
    if (!editor.value) return
    const normalized = sanitizeAndNormalizeHtml(editor.value.getHTML())
    editor.value.commands.setContent(normalized, { emitUpdate: false })
    emit('update:modelValue', normalized)
  },
  insertContent(html: string) {
    if (!editor.value) return
    let contentToInsert = html
    if (props.defaultFont && !html.includes('font-family')) {
      contentToInsert = `<span style="font-family: ${props.defaultFont}">${html}</span>`
    }
    editor.value.chain().focus().insertContent(contentToInsert).run()
  },
})
</script>

<template>
  <div ref="editorWrapperRef" class="relative border border-gray-200 rounded-xl overflow-hidden">
    <!-- Content area -->
    <EditorContent
      v-show="!htmlMode"
      :editor="editor"
      class="bg-white"
      :class="{ 'ctrl-held': ctrlHeld }"
    />
    <textarea
      v-if="htmlMode"
      :value="htmlSource"
      class="w-full bg-white text-sm font-mono text-gray-700 resize-y focus:outline-none"
      style="min-height: 200px; padding: 12px 16px;"
      @input="onHtmlSourceInput"
    />

    <!-- Link edit popover -->
    <div
      v-if="showLinkPopover"
      ref="linkPopoverRef"
      class="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[300px]"
      :style="linkPopoverPos"
      @click.stop
    >
      <div class="space-y-2">
        <div>
          <label class="block text-[10px] font-medium text-gray-500 mb-0.5">Text</label>
          <input
            v-model="linkText"
            name="link-text"
            type="text"
            class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Zobrazený text"
            @keydown="onLinkKeydown"
          />
        </div>
        <div>
          <label class="block text-[10px] font-medium text-gray-500 mb-0.5">Odkaz</label>
          <input
            v-model="linkUrl"
            name="link-url"
            type="text"
            class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="https://…"
            @keydown="onLinkKeydown"
          />
        </div>
        <div class="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            class="px-3 py-1 text-xs font-medium text-white bg-primary rounded-lg hover:opacity-90 transition-opacity"
            @click="applyLink"
          >Použít</button>
          <button
            v-if="toolbarRef?.isLinkActive"
            type="button"
            class="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            @click="removeLink"
          >Odebrat odkaz</button>
          <button
            type="button"
            class="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            @click="showLinkPopover = false; editor?.commands.focus()"
          >Zrušit</button>
        </div>
      </div>
    </div>

    <!-- Link hover tooltip -->
    <div
      v-if="linkTooltip.show"
      class="absolute z-40 px-2 py-1 text-[11px] text-gray-500 bg-white border border-gray-200 rounded-lg shadow-sm max-w-[250px] truncate pointer-events-none"
      :style="{ top: linkTooltip.y + 'px', left: linkTooltip.x + 'px' }"
    >
      {{ linkTooltip.url }}
      <span class="text-gray-300 ml-1">Ctrl+klik</span>
    </div>

    <!-- Toolbar -->
    <RichTextToolbar
      ref="toolbarRef"
      :editor="editor"
      :tx-counter="txCounter"
      :html-mode="htmlMode"
      :default-font="defaultFont"
      @toggle-html-mode="toggleHtmlMode"
      @open-link-popover="openLinkPopover"
    />
  </div>
</template>

<style>
.ProseMirror {
  min-height: 200px;
  padding: 12px 16px;
  outline: none;
  font-size: 0.875rem;
  line-height: 1.65;
  color: #374151;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ProseMirror p {
  margin: 0 0 0.5em 0;
}

.ProseMirror ul {
  padding-left: 1.5em;
  list-style-type: disc;
}

.ProseMirror ol {
  padding-left: 1.5em;
  list-style-type: decimal;
}

.ProseMirror blockquote {
  border-left: 3px solid #e5e7eb;
  margin: 0;
  padding-left: 1em;
  color: #6b7280;
}

.ProseMirror a {
  color: var(--color-primary, #6366f1);
  text-decoration: underline;
  cursor: text;
}

.ctrl-held .ProseMirror a {
  cursor: pointer;
}

.ProseMirror p.is-editor-empty:first-child::before {
  color: #9ca3af;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.ProseMirror .template-var {
  background-color: #ede9fe;
  color: #6d28d9;
  border-radius: 3px;
  padding: 0 2px;
}
</style>
