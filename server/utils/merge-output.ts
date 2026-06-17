export function mergeScalar(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && v !== '') result[k] = v
  }
  return result
}

export function contactKey(c: Record<string, unknown>): string {
  const email = String(c.email ?? '').toLowerCase().trim()
  if (email) return email
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase().trim()
    || String(c.name ?? '').toLowerCase().trim()
  return name
}

export function mergeContacts(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const c of existing) {
    const k = contactKey(c)
    if (k) map.set(k, c)
  }
  for (const c of incoming) {
    const k = contactKey(c)
    if (!k) continue
    map.set(k, map.has(k) ? mergeScalar(map.get(k)!, c) : c)
  }
  return [...map.values()]
}

// Strips legal suffixes, parenthetical qualifiers and punctuation so that
// "EPAM" matches "EPAM Systems (Czech Republic) s.r.o."
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.\s*s\s*r\.?\s*o\.?|z\.?\s*s\.?|o\.?\s*p\.?\s*s\.?|ltd\.?|inc\.?|llc\.?|gmbh\.?|corp\.?|co\.?|group|holding|systems|services|solutions)\b/g, '')
    .replace(/[,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Returns the existing map key that fuzzy-matches newKey, or null if none found.
export function fuzzyMatchCompany(
  newKey: string,
  recordMap: Map<string, Record<string, unknown>>,
): string | null {
  const normNew = normalizeCompanyName(newKey)
  if (!normNew) return null
  for (const existingKey of recordMap.keys()) {
    const normExisting = normalizeCompanyName(existingKey)
    if (!normExisting) continue
    if (normExisting === normNew) return existingKey
    if (normExisting.startsWith(normNew) || normNew.startsWith(normExisting)) return existingKey
  }
  return null
}

export function mergeOutputData(existing: unknown, newData: unknown, stepType: string): unknown {
  if (stepType === 'PARTNER_IDENTIFICATION') {
    const existingItems = (existing as { items?: unknown[] } | null)?.items ?? []
    const newItems = (() => {
      if (!newData || typeof newData !== 'object') return []
      if (Array.isArray(newData)) return newData
      const d = newData as Record<string, unknown>
      return Array.isArray(d.items) ? d.items : []
    })()

    const itemMap = new Map<string, Record<string, unknown>>()
    for (const item of existingItems) {
      const key = String((item as Record<string, unknown>).itemName ?? '').toLowerCase()
      if (key) itemMap.set(key, item as Record<string, unknown>)
    }
    for (const item of newItems as Record<string, unknown>[]) {
      const key = String(item.itemName ?? '').toLowerCase()
      if (!key) continue
      if (itemMap.has(key)) {
        const ex = itemMap.get(key)!
        const mergedPartners = [
          ...((ex.partners as Record<string, unknown>[] | undefined) ?? []),
          ...((item.partners as Record<string, unknown>[] | undefined) ?? []),
        ].reduce<Record<string, unknown>[]>((acc, p) => {
          const pk = String(p.partnerId ?? p.name ?? '').toLowerCase()
          if (!pk || acc.some(a => String(a.partnerId ?? a.name ?? '').toLowerCase() === pk)) return acc
          return [...acc, p]
        }, [])
        itemMap.set(key, { ...ex, ...item, partners: mergedPartners })
      } else {
        itemMap.set(key, item)
      }
    }
    return { ...(existing as object ?? {}), items: [...itemMap.values()] }
  }

  const newItems: unknown[] = Array.isArray(newData)
    ? newData
    : (typeof newData === 'object' && newData !== null ? [newData] : [])

  if (newItems.length === 0) return existing ?? []

  const existingArr = Array.isArray(existing) ? existing : []
  const keyField = (stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT') ? 'name' : 'url'

  const recordMap = new Map<string, Record<string, unknown>>()
  for (const item of existingArr as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (key) recordMap.set(key, item)
  }
  for (const item of newItems as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (!key) continue
    const matchKey = recordMap.has(key)
      ? key
      : ((stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT') ? fuzzyMatchCompany(key, recordMap) : null)
    if (matchKey !== null) {
      const ex = recordMap.get(matchKey)!
      if (stepType === 'PARTNER_PROFILING') {
        const mergedContacts = mergeContacts(
          Array.isArray(ex.contacts) ? ex.contacts as Record<string, unknown>[] : [],
          Array.isArray(item.contacts) ? item.contacts as Record<string, unknown>[] : [],
        )
        recordMap.set(matchKey, { ...mergeScalar(ex, item), contacts: mergedContacts })
      } else {
        recordMap.set(matchKey, mergeScalar(ex, item))
      }
    } else {
      recordMap.set(key, item)
    }
  }
  return [...recordMap.values()]
}
