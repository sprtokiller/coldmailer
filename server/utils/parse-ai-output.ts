function extractFromFence(text: string): string {
  const openMatch = text.match(/```(?:json)?\s*\n?/)
  if (!openMatch || openMatch.index === undefined) return text.trim()
  const contentStart = openMatch.index + openMatch[0].length
  const afterFence = text.slice(contentStart)
  const closeMatch = afterFence.match(/\n```/)
  if (closeMatch?.index !== undefined) return afterFence.slice(0, closeMatch.index).trim()
  return afterFence.trim()
}

function repairJSON(text: string): string {
  let inString = false
  let escape = false
  let lastCompleteItemEnd = -1
  let rootIsArray = false
  const openStack: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '[' || ch === '{') {
      if (openStack.length === 0 && ch === '[') rootIsArray = true
      openStack.push(ch)
    } else if (ch === ']' || ch === '}') {
      openStack.pop()
      if (rootIsArray && openStack.length === 1 && ch === '}') lastCompleteItemEnd = i + 1
      else if (openStack.length === 0) return text.slice(0, i + 1)
    }
  }

  if (!rootIsArray) return text

  if (lastCompleteItemEnd > 0) return text.slice(0, lastCompleteItemEnd) + ']'

  let suffix = inString ? '"' : ''
  for (let i = openStack.length - 1; i >= 0; i--) suffix += openStack[i] === '[' ? ']' : '}'
  return text + suffix
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1')
}

export function parseAIOutput(text: string): { data: unknown; error: null } | { data: null; error: string } {
  const seen = new Set<string>()
  const candidates: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      candidates.push(t)
    }
  }

  add(extractFromFence(text))
  const jsonStart = text.search(/[\[{]/)
  if (jsonStart >= 0) add(text.slice(jsonStart))
  add(text)

  const errors: string[] = []
  for (const raw of candidates) {
    for (const candidate of [raw, stripTrailingCommas(raw)]) {
      try { return { data: JSON.parse(candidate), error: null } } catch (e) { errors.push(`direct: ${e}`) }
      try { return { data: JSON.parse(repairJSON(candidate)), error: null } } catch (e) { errors.push(`repaired: ${e}`) }
    }
  }
  return { data: null, error: errors.join(' | ') }
}