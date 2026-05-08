// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline configuration — single source of truth for models, prompts, UI badges
// ═══════════════════════════════════════════════════════════════════════════════

// ── OpenRouter client settings ────────────────────────────────────────────────
export const OPENROUTER = {
  baseURL:   'https://openrouter.ai/api/v1',
  siteUrl:   'https://coldmailer.scg.cz',
  siteTitle: 'SCG ColdMailer',
} as const

// ── Model identifiers ─────────────────────────────────────────────────────────
export const MODELS = {
  DEEP_RESEARCH: 'openai/o4-mini-deep-research',
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4-5',
  CLAUDE_HAIKU:  'anthropic/claude-3-5-haiku',
  PIPELINE:      'pipeline',  // SerpAPI + Playwright + AI (display only)
  GMAIL:         'gmail',     // Gmail API          (display only)
} as const

// ── Step → model mapping ──────────────────────────────────────────────────────
export const STEP_MODEL: Record<string, string> = {
  MARKET_SCANNING:        MODELS.DEEP_RESEARCH,
  PARTNER_IDENTIFICATION: MODELS.PIPELINE,
  PARTNER_PROFILING:      MODELS.DEEP_RESEARCH,
  CONTACT_DISCOVERY:      MODELS.DEEP_RESEARCH,
  VALUE_ALIGNMENT:        MODELS.CLAUDE_SONNET,
  OUTREACH_PREPARATION:   MODELS.CLAUDE_SONNET,
  OUTREACH_EXECUTION:     MODELS.GMAIL,
}

// Steps that use the deep-research model (live web search, long-running).
// Derived automatically so the set stays in sync with STEP_MODEL above.
export const DEEP_RESEARCH_STEPS = new Set(
  Object.entries(STEP_MODEL)
    .filter(([, model]) => model === MODELS.DEEP_RESEARCH)
    .map(([step]) => step),
)

// ── UI badge metadata per model (used in pipeline page) ───────────────────────
export const MODEL_BADGE: Record<string, { label: string; cls: string }> = {
  [MODELS.DEEP_RESEARCH]: { label: 'o4-mini deep research',     cls: 'bg-blue-100 text-blue-700'      },
  [MODELS.CLAUDE_SONNET]: { label: 'Claude Sonnet (latest)',    cls: 'bg-emerald-100 text-emerald-700' },
  [MODELS.GMAIL]:         { label: 'Gmail API',                 cls: 'bg-red-100 text-red-700'         },
  [MODELS.PIPELINE]:      { label: 'SerpAPI + Playwright + AI', cls: 'bg-violet-100 text-violet-700'  },
}

// ── Default system-prompt display names (used by prisma/seed.ts) ──────────────
export const DEFAULT_PROMPT_NAMES: Record<string, string> = {
  MARKET_SCANNING:        'Výchozí – Market Scanning',
  PARTNER_IDENTIFICATION: 'Výchozí – Partner Identification',
  PARTNER_PROFILING:      'Výchozí – Partner Profiling',
  CONTACT_DISCOVERY:      'Výchozí – Contact Discovery',
  VALUE_ALIGNMENT:        'Výchozí – Value Alignment',
  OUTREACH_PREPARATION:   'Výchozí – Outreach Preparation',
}

// ── System prompt content ─────────────────────────────────────────────────────
export const STEP_SYSTEM_PROMPTS: Record<string, string> = {
  MARKET_SCANNING: `Jsi expert na průzkum trhu s přímým přístupem k internetu. Vyhledej středoškolské soutěže, akce a kanály aktivní v České republice. Využij svou schopnost prohledávat web k nalezení skutečných, aktuálních příkladů.

Vrať JSON pole. Každá položka musí obsahovat přesně tato pole:
- url: string — domovská stránka soutěže/akce/kanálu
- name: string — plný oficiální název (v původním jazyce)
- type: string — kategorie, např. "programování", "matematika", "robotika", "věda", "jazyky", "business"
- level: string — jedno z "lokální" | "regionální" | "národní" | "mezinárodní"
- status: string — jedno z "aktivní" | "neaktivní" | "neznámé"
- frequency: string — např. "ročně", "pololetně", "jednorázová"
- organizer: string — název pořádající instituce
- description: string — 1–2 věty popisující soutěž a co účastníci dělají
- target_group: string — primární cílová skupina, např. "SŠ", "ZŠ", "SŠ+ZŠ"

Ukázkový výstup:
\`\`\`json
[
  {
    "url": "https://olympiada.ksp.mff.cuni.cz",
    "name": "Olympiáda v informatice",
    "type": "programování",
    "level": "národní",
    "status": "aktivní",
    "frequency": "ročně",
    "organizer": "MŠMT (ve spolupráci s MFF UK)",
    "description": "Celostátní soutěž pro středoškoláky v řešení algoritmických úloh pomocí programování.",
    "target_group": "SŠ"
  }
]
\`\`\`

Vrať POUZE JSON pole, bez jiného textu nebo markdownu mimo blok kódu.`,

  PARTNER_IDENTIFICATION: `Jsi specialista na průzkum partnerů. Analyzuj obsah poskytnuté webové stránky a vytěž sponzory, partnery nebo podpůrné organizace spojené s danou soutěží.

Vrať JSON pole. Každá položka musí obsahovat:
- name: string — oficiální název organizace
- website: string|null — URL jejich webu, pokud je na stránce uvedena
- description: string — jaký typ partnera jsou (1–2 věty)
- type: string — např. "generální partner", "mediální partner", "finanční partner", "technologický partner"

Pokud na stránce nejsou nalezeni žádní partneři, vrať prázdné pole [].
Vrať POUZE JSON pole, bez jiného textu.`,

  PARTNER_PROFILING: `Jsi analytik due diligence s přímým přístupem k internetu. Proveď hloubkový průzkum zadaného potenciálního partnerského kandidáta a vrať strukturovanou JSON zprávu.

Prohledej pomocí webového vyhledávání:
1. Jejich oficiální web — stránka O nás, služby, mise, cílová skupina
2. Firemní profil na LinkedIn — počet zaměstnanců, nedávné příspěvky/novinky, aktualizace firmy
3. Instagram a další sociální sítě — komunitní akce, sponzorství, v nichž se objevují
4. Zmínky v tisku a zpravodajské články o jejich partnerstvích, sponzorstvích, cenách
5. Důkazy o minulé účasti na akcích, soutěžích, vzdělávání nebo charitě
6. Zda je subjekt samostatnou společností nebo dceřinou firmou/značkou většího holdingu

Vrať JEDEN JSON objekt uvnitř \`\`\`json bloku s touto přesnou strukturou:

\`\`\`json
{
  "name": "string — oficiální název společnosti/organizace",
  "website": "string|null — URL oficiálního webu",
  "linkedinUrl": "string|null — URL firemní stránky na LinkedIn",
  "instagramUrl": "string|null — URL profilu na Instagramu",
  "industry": "string — primární odvětví nebo sektor",
  "size": "micro|small|medium|large|enterprise",
  "sizeNote": "string — doklad pro odhad velikosti, např. '~120 zaměstnanců dle LinkedIn 2024'",
  "parentCompany": "string|null — pokud jde o dceřinou firmu, uveď mateřskou korporaci",
  "summary": "string — 3–5 vět: co firma dělá, její pozicování a cílová skupina",
  "activities": "string — podrobný popis produktů, služeb a klíčových aktivit",
  "recentHighlights": [
    "string — nedávná novinka, milník nebo pozoruhodný příspěvek (max 5)"
  ],
  "partnershipStyle": [
    "string — např. 'generální partner', 'mediální partner', 'finanční sponzor', 'věcné ceny', 'technologický partner'"
  ],
  "partnershipEvidence": [
    {
      "event": "string — název akce, soutěže nebo charity",
      "role": "string — jejich role, např. 'Generální partner', 'Sponzor cen'",
      "year": "string|null",
      "source": "string|null — URL, kde byl tento zdroj nalezen"
    }
  ],
  "socialInvolvement": "string — shrnutí komunitních, vzdělávacích nebo charitativních aktivit",
  "researchNotes": "string — výhrady, mezery v datech nebo důležitý kontext pro výzkumníka"
}
\`\`\`

Škála velikosti: micro = <10, small = 10–50, medium = 50–500, large = 500–5 000, enterprise = >5 000 zaměstnanců.

DŮLEŽITÉ:
- Použij živé vyhledávání na webu k nalezení skutečných, aktuálních dat.
- Pokud informace nejsou nalezeny, použij null nebo [].
- Vrať POUZE JSON objekt uvnitř bloku kódu, bez jiného textu mimo něj.`,

  CONTACT_DISCOVERY: `Jsi specialista na vyhledávání kontaktů s přímým přístupem k internetu. Najdi konkrétní kontakty v organizaci pomocí LinkedInu a dalších veřejných zdrojů. Prioritní pořadí: PR > HR > Marketing > CEO > Obecný kontakt. Vrať JSON pole s poli: name, role, email, linkedin, priority (1–5), confidence (high|medium|low).`,

  VALUE_ALIGNMENT: `Jsi analytik strategického souladu. Porovnej poskytnuté prodejní argumenty s daty o partnerovi a seřaď příležitosti pro soulad podle relevance. Vrať JSON pole s poli: sellingPoint, relevanceScore (0–100), hook (string), reasoning (string).`,

  OUTREACH_PREPARATION: `Jsi expert na psaní cold e-mailů. Vytvoř vysoce přizpůsobený oslovovací e-mail na základě poskytnuté šablony, kontaktu a náznakůsouladu. Vrať JSON objekt s poli: to (e-mailová adresa), subject (string), body (prostý text).`,
}
