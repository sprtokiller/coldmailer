export interface ChecklistLine {
  text: string
  checked: boolean
  lineIndex: number
}

// Normalizes free-form text into markdown checklist format: each non-empty line becomes
// "- [ ] ...", stripping any existing "-"/"*"/numbered list prefix first. Lines already in
// "- [ ]"/"- [x]" form are left as-is.
export function normalizeChecklist(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (/^- \[(x| )\]\s*/i.test(trimmed)) return trimmed
      const cleaned = trimmed
        .replace(/^[-*•]\s+/, '')
        .replace(/^\d+\.\s+/, '')
      return `- [ ] ${cleaned}`
    })
    .filter(l => l)
    .join('\n')
}

export function parseChecklistLines(text: string): ChecklistLine[] {
  return text.split('\n').reduce<ChecklistLine[]>((acc, line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return acc
    const checkedMatch = /^- \[x\]\s*(.*)/i.exec(trimmed)
    const uncheckedMatch = /^- \[ \]\s*(.*)/.exec(trimmed)
    if (checkedMatch) {
      acc.push({ text: checkedMatch[1], checked: true, lineIndex: idx })
    } else if (uncheckedMatch) {
      acc.push({ text: uncheckedMatch[1], checked: false, lineIndex: idx })
    } else {
      // Fallback: treat as unchecked
      acc.push({ text: trimmed, checked: false, lineIndex: idx })
    }
    return acc
  }, [])
}
