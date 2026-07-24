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

// Přepne stav zaškrtnutí (- [ ] ↔ - [x]) na daném řádku (index v split('\n')), zbytek beze změny.
export function toggleChecklistLine(text: string, lineIndex: number): string {
  const lines = text.split('\n')
  const line = lines[lineIndex]
  if (line === undefined) return text
  if (/^\s*- \[x\]/i.test(line)) {
    lines[lineIndex] = line.replace(/(- \[)x(\])/i, '$1 $2')
  } else if (/^\s*- \[ \]/.test(line)) {
    lines[lineIndex] = line.replace(/(- \[) (\])/, '$1x$2')
  }
  return lines.join('\n')
}

// ── To-Do (checklist s volitelným datem deadline) ────────────────────────────────

export interface TodoLine {
  raw: string // text za checkboxem, včetně případného vedoucího data
  label: string // text bez vedoucího data (pro zobrazení)
  checked: boolean
  dueDate: Date | null
  lineIndex: number
}

// České číselné datum na začátku textu: "24. 7. 2026" (mezery volitelné).
const TODO_DATE_RE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+|$)/

export function parseTodoDate(s: string): { date: Date | null; rest: string } {
  const m = TODO_DATE_RE.exec(s)
  if (!m) return { date: null, rest: s }
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3])
  const d = new Date(year, month - 1, day)
  // Odmítnout nevalidní datum (např. 32. 1. 2026 → přeteče do února).
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return { date: null, rest: s }
  }
  return { date: d, rest: s.slice(m[0].length) }
}

// České číselné formátování data: "24. 7. 2026".
export function formatTodoDate(d: Date): string {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
}

export function parseTodoLines(text: string): TodoLine[] {
  return text.split('\n').reduce<TodoLine[]>((acc, line, idx) => {
    const trimmed = line.trim()
    if (!trimmed) return acc
    const checkedMatch = /^- \[x\]\s*(.*)/i.exec(trimmed)
    const uncheckedMatch = /^- \[ \]\s*(.*)/.exec(trimmed)
    let checked = false
    let rest = trimmed
    if (checkedMatch) { checked = true; rest = checkedMatch[1] }
    else if (uncheckedMatch) { checked = false; rest = uncheckedMatch[1] }
    const { date, rest: label } = parseTodoDate(rest)
    acc.push({ raw: rest, label: label.trim(), checked, dueDate: date, lineIndex: idx })
    return acc
  }, [])
}

// Normalizace To-Do textu na markdown checklist. Na rozdíl od normalizeChecklist NEODSTRAŇUJE
// číslovaný prefix ("20. "), aby se nezničila vedoucí data položek.
export function normalizeTodo(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (/^- \[(x| )\]\s*/i.test(trimmed)) return trimmed
      const cleaned = trimmed.replace(/^[-*•]\s+/, '')
      return `- [ ] ${cleaned}`
    })
    .filter(l => l)
    .join('\n')
}

export type TodoUrgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'later' | 'none'

// Naléhavost podle počtu dní do termínu (kalendářní dny, ne 24h okna).
export function todoUrgency(dueDate: Date | null, now: Date = new Date()): TodoUrgency {
  if (!dueDate) return 'none'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
  const days = Math.round((due - startOfToday) / 86_400_000)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days < 3) return 'soon'
  if (days < 7) return 'upcoming'
  return 'later'
}

// Tailwind odstíny sdílené sloupcem v seznamu i badgem u položky (stejná paleta jako
// lastInteractionColor). Po termínu / dnes = červená, blíž = oranžová, dál = žlutá.
export function todoColorClass(u: TodoUrgency): string {
  switch (u) {
    case 'overdue':
    case 'today': return 'bg-red-100 text-red-700'
    case 'soon': return 'bg-orange-100 text-orange-700'
    case 'upcoming': return 'bg-yellow-100 text-yellow-700'
    default: return ''
  }
}
