import DOMPurify from 'dompurify'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's',
  'a',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'mark',
  'sub', 'sup',
]

const ALLOWED_ATTR = ['style', 'href', 'target', 'rel']

const SAFE_STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'color', 'background-color',
  'line-height', 'text-align',
])

const STYLE_ORDER: string[] = [
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'color', 'background-color',
  'line-height', 'text-align',
]

const INHERITED_STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'color', 'line-height',
])

const UNSAFE_CSS_VALUE_RE = /expression\s*\(|url\s*\(|@import|behavior\s*:|binding\s*:|var\s*\(/i

const UNSAFE_PROTOCOL_RE = /^\s*(javascript|data|vbscript)\s*:/i

const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup'])

const FORMATTING_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NormalizeHtmlOptions {
  sanitize?: boolean
  normalize?: boolean
}

export function sanitizeAndNormalizeHtml(
  html: string,
  options?: NormalizeHtmlOptions,
): string {
  if (!html || !html.trim()) return ''
  const { sanitize = true, normalize = true } = options ?? {}

  let result = html
  if (sanitize) result = sanitizeHtml(result)
  if (normalize) result = normalizeHtml(result)
  return result
}

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  if (typeof window === 'undefined') return html

  ensurePurifyHooks()

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

const EMAIL_ALLOWED_TAGS = [
  ...ALLOWED_TAGS,
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'img', 'hr', 'center',
]

const EMAIL_ALLOWED_ATTR = [
  ...ALLOWED_ATTR,
  'src', 'alt', 'width', 'height', 'align', 'valign',
  'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan',
  'bgcolor',
]

let _emailMode = false

export function sanitizeEmailHtml(html: string): string {
  if (!html) return ''
  if (typeof window === 'undefined') return html

  ensurePurifyHooks()

  _emailMode = true
  const result = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
  _emailMode = false
  return result
}

export function normalizeHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(
    `<body><div id="__root">${html}</div></body>`,
    'text/html',
  )
  const root = doc.getElementById('__root')!

  normalizeStyleAttributes(root)
  normalizeEmptyParagraphs(root)
  moveTrailingBreaks(root)
  removeUselessSpans(root)
  removeRedundantInheritedStyles(root, new Map())
  hoistCommonFontFamily(root)
  removeUselessSpans(root)
  mergeAdjacentInlines(root)
  normalizeLinks(root)
  cleanupEmptyStyleAttrs(root)

  return serializeChildren(root)
}

// ---------------------------------------------------------------------------
// DOMPurify hooks (registered once)
// ---------------------------------------------------------------------------

let _hooksRegistered = false

function ensurePurifyHooks(): void {
  if (_hooksRegistered) return
  _hooksRegistered = true

  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.hasAttribute('style')) {
      if (_emailMode) {
        const raw = node.getAttribute('style')!
        if (UNSAFE_CSS_VALUE_RE.test(raw)) {
          node.removeAttribute('style')
        }
      } else {
        const filtered = filterStyleString(node.getAttribute('style')!)
        if (filtered) {
          node.setAttribute('style', filtered)
        } else {
          node.removeAttribute('style')
        }
      }
    }

    if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href && UNSAFE_PROTOCOL_RE.test(href)) {
        node.removeAttribute('href')
      }
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src')
      if (src && UNSAFE_PROTOCOL_RE.test(src)) {
        node.removeAttribute('src')
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function parseStyleString(style: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!style) return map
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const prop = decl.slice(0, colon).trim().toLowerCase()
    const val = decl.slice(colon + 1).trim()
    if (prop && val) map.set(prop, val)
  }
  return map
}

function serializeStyleMap(map: Map<string, string>): string {
  const ordered: string[] = []
  for (const prop of STYLE_ORDER) {
    const val = map.get(prop)
    if (val !== undefined) ordered.push(`${prop}: ${normalizeStyleValue(prop, val)}`)
  }
  for (const [prop, val] of map) {
    if (!STYLE_ORDER.includes(prop)) {
      ordered.push(`${prop}: ${normalizeStyleValue(prop, val)}`)
    }
  }
  return ordered.join('; ')
}

function filterStyleString(style: string): string {
  const map = parseStyleString(style)
  const safe = new Map<string, string>()
  for (const [prop, val] of map) {
    if (!SAFE_STYLE_PROPS.has(prop)) continue
    if (UNSAFE_CSS_VALUE_RE.test(val)) continue
    safe.set(prop, val)
  }
  return serializeStyleMap(safe)
}

function normalizeStyleValue(prop: string, val: string): string {
  if (prop === 'color' || prop === 'background-color') return normalizeColor(val)
  if (prop === 'font-family') return normalizeFontFamily(val)
  return val
}

function normalizeColor(val: string): string {
  const v = val.trim()

  // Already rgb(...) — normalise spacing
  const rgbMatch = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgbMatch) return `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`

  const rgbaMatch = v.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i)
  if (rgbaMatch) return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${rgbaMatch[4]})`

  // Hex → rgb
  const hex = v.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgb(${r}, ${g}, ${b})`
    }
  }

  // Named colours — keep as-is (browser will normalise them anyway)
  return v
}

function normalizeFontFamily(val: string): string {
  return val
    .split(',')
    .map(f => {
      const t = f.trim().replace(/^["']|["']$/g, '')
      return t.includes(' ') ? `"${t}"` : t
    })
    .join(', ')
}

function getStyleMap(el: HTMLElement): Map<string, string> {
  const attr = el.getAttribute('style')
  return attr ? parseStyleString(attr) : new Map()
}

function setStyleMap(el: HTMLElement, map: Map<string, string>): void {
  if (map.size === 0) {
    el.removeAttribute('style')
  } else {
    el.setAttribute('style', serializeStyleMap(map))
  }
}

// ---------------------------------------------------------------------------
// Normalise style attributes (consistent serialisation)
// ---------------------------------------------------------------------------

function normalizeStyleAttributes(root: HTMLElement): void {
  for (const el of root.querySelectorAll('[style]')) {
    const map = parseStyleString(el.getAttribute('style')!)
    const safe = new Map<string, string>()
    for (const [prop, val] of map) {
      if (SAFE_STYLE_PROPS.has(prop) && !UNSAFE_CSS_VALUE_RE.test(val)) {
        safe.set(prop, val)
      }
    }
    setStyleMap(el as HTMLElement, safe)
  }
}

// ---------------------------------------------------------------------------
// Remove redundant inherited styles
// ---------------------------------------------------------------------------

function removeRedundantInheritedStyles(
  node: HTMLElement,
  parentStyles: Map<string, string>,
): void {
  const myStyles = getStyleMap(node)

  const effective = new Map(parentStyles)
  for (const [prop, val] of myStyles) {
    if (INHERITED_STYLE_PROPS.has(prop)) {
      const parentVal = parentStyles.get(prop)
      if (parentVal && normalizeStyleValue(prop, val) === normalizeStyleValue(prop, parentVal)) {
        myStyles.delete(prop)
      }
    }
    effective.set(prop, val)
  }

  setStyleMap(node, myStyles)

  for (const child of Array.from(node.children)) {
    if (child instanceof HTMLElement) {
      removeRedundantInheritedStyles(child, effective)
    }
  }
}

// ---------------------------------------------------------------------------
// Hoist common font-family to wrapper
// ---------------------------------------------------------------------------

function hoistCommonFontFamily(root: HTMLElement): void {
  const counts = new Map<string, number>()
  let total = 0

  function countFonts(el: HTMLElement) {
    const map = getStyleMap(el)
    const ff = map.get('font-family')
    if (ff) {
      const norm = normalizeFontFamily(ff)
      counts.set(norm, (counts.get(norm) ?? 0) + 1)
      total++
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) countFonts(child)
    }
  }
  countFonts(root)

  if (total === 0) return

  let dominant = ''
  let maxCount = 0
  for (const [font, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      dominant = font
    }
  }

  // Only hoist if a clear majority
  if (maxCount < Math.ceil(total * 0.6)) return

  function removeDominantFont(el: HTMLElement) {
    const map = getStyleMap(el)
    const ff = map.get('font-family')
    if (ff && normalizeFontFamily(ff) === dominant) {
      map.delete('font-family')
      setStyleMap(el, map)
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) removeDominantFont(child)
    }
  }
  removeDominantFont(root)

  // Set on root (will become the wrapping div)
  const rootMap = getStyleMap(root)
  rootMap.set('font-family', dominant)
  setStyleMap(root, rootMap)
}

// ---------------------------------------------------------------------------
// Normalise empty paragraphs: <p><span...><strong><br></strong></span></p> → <p><br></p>
// ---------------------------------------------------------------------------

function normalizeEmptyParagraphs(root: HTMLElement): void {
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (isEmptyBlock(p)) {
      while (p.firstChild) p.removeChild(p.firstChild)
      p.appendChild(p.ownerDocument.createElement('br'))
      p.removeAttribute('style')
    }
  }
}

function isEmptyBlock(el: Element): boolean {
  // A paragraph is "empty" if its only meaningful content is a <br> (possibly wrapped in formatting/spans)
  const children = Array.from(el.childNodes)
  if (children.length === 0) return true
  if (children.length === 1) {
    const child = children[0]
    if (child.nodeType === 3) return !child.textContent?.trim()
    if (child instanceof Element) {
      if (child.tagName === 'BR') return true
      return isEmptyBlock(child)
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Move trailing <br> out of formatting wrappers
// ---------------------------------------------------------------------------

function moveTrailingBreaks(root: HTMLElement): void {
  for (const br of Array.from(root.querySelectorAll('br'))) {
    const parent = br.parentElement
    if (!parent) continue
    if (!FORMATTING_TAGS.has(parent.tagName.toLowerCase())) continue

    // Only move if <br> is the last child
    if (br !== parent.lastChild) continue

    const grandparent = parent.parentElement
    if (!grandparent) continue

    // If <br> is the ONLY child, unwrap entirely
    if (parent.childNodes.length === 1) {
      grandparent.replaceChild(br, parent)
    } else {
      // Move <br> after the parent element
      parent.removeChild(br)
      if (parent.nextSibling) {
        grandparent.insertBefore(br, parent.nextSibling)
      } else {
        grandparent.appendChild(br)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Remove empty/useless spans
// ---------------------------------------------------------------------------

function removeUselessSpans(root: HTMLElement): void {
  // Bottom-up to handle nested useless spans
  const spans = Array.from(root.querySelectorAll('span'))
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]
    if (!span.parentNode) continue
    const hasStyle = span.hasAttribute('style') && span.getAttribute('style')!.trim() !== ''
    if (!hasStyle) {
      unwrapElement(span)
    }
  }
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el)
  }
  parent.removeChild(el)
}

// ---------------------------------------------------------------------------
// Merge adjacent inline elements with identical tag+style
// ---------------------------------------------------------------------------

function mergeAdjacentInlines(root: HTMLElement): void {
  // Process each container that can have inline children
  function processContainer(container: Element) {
    let changed = true
    while (changed) {
      changed = false
      const children = Array.from(container.childNodes)
      for (let i = 0; i < children.length - 1; i++) {
        const a = children[i]
        const b = children[i + 1]
        if (!(a instanceof Element) || !(b instanceof Element)) continue
        if (!INLINE_TAGS.has(a.tagName.toLowerCase())) continue
        if (a.tagName !== b.tagName) continue
        if ((a.getAttribute('style') ?? '') !== (b.getAttribute('style') ?? '')) continue
        // Same tag + same style → merge b into a
        while (b.firstChild) a.appendChild(b.firstChild)
        b.remove()
        changed = true
        break
      }
    }
    // Recurse into children
    for (const child of Array.from(container.children)) {
      processContainer(child)
    }
  }
  processContainer(root)
}

// ---------------------------------------------------------------------------
// Normalise links
// ---------------------------------------------------------------------------

function normalizeLinks(root: HTMLElement): void {
  for (const a of Array.from(root.querySelectorAll('a'))) {
    const href = a.getAttribute('href')

    if (!href) continue

    // Remove dangerous protocols
    if (UNSAFE_PROTOCOL_RE.test(href.trim())) {
      a.removeAttribute('href')
      continue
    }

    // Prefer https for bare domains
    if (/^www\./i.test(href.trim())) {
      a.setAttribute('href', `https://${href.trim()}`)
    }

    // Ensure rel on target=_blank
    if (a.getAttribute('target') === '_blank') {
      a.setAttribute('rel', 'noopener noreferrer')
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup: remove empty style="" attributes
// ---------------------------------------------------------------------------

function cleanupEmptyStyleAttrs(root: HTMLElement): void {
  for (const el of root.querySelectorAll('[style]')) {
    if (!el.getAttribute('style')?.trim()) {
      el.removeAttribute('style')
    }
  }
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

function serializeChildren(el: HTMLElement): string {
  const rootStyle = el.getAttribute('style')
  const inner = el.innerHTML

  if (rootStyle) {
    const wrapper = el.ownerDocument.createElement('div')
    wrapper.setAttribute('style', rootStyle)
    wrapper.innerHTML = inner
    return wrapper.outerHTML
  }
  return inner
}
