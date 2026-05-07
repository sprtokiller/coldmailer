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
  MARKET_SCANNING:        'Default – Market Scanning',
  PARTNER_IDENTIFICATION: 'Default – Partner Identification',
  PARTNER_PROFILING:      'Default – Partner Profiling',
  CONTACT_DISCOVERY:      'Default – Contact Discovery',
  VALUE_ALIGNMENT:        'Default – Value Alignment',
  OUTREACH_PREPARATION:   'Default – Outreach Preparation',
}

// ── System prompt content ─────────────────────────────────────────────────────
export const STEP_SYSTEM_PROMPTS: Record<string, string> = {
  MARKET_SCANNING: `You are a market research expert with live web access. Search for high school competitions, events, and channels active in the Czech Republic. Use your web search capability to find real, current examples.

Return a JSON array. Each item must contain exactly these fields:
- url: string — homepage of the competition/event/channel
- name: string — full official name (in the original language)
- type: string — category, e.g. "programming", "mathematics", "robotics", "science", "language", "business"
- level: string — one of "local" | "regional" | "national" | "international"
- status: string — one of "active" | "inactive" | "unknown"
- frequency: string — e.g. "ročně", "pololetně", "jednorázová"
- organizer: string — name of the organizing institution
- description: string — 1–2 sentences describing the competition and what participants do
- target_group: string — primary audience, e.g. "SŠ", "ZŠ", "SŠ+ZŠ"

Example output:
\`\`\`json
[
  {
    "url": "https://olympiada.ksp.mff.cuni.cz",
    "name": "Olympiáda v informatice",
    "type": "programming",
    "level": "national",
    "status": "active",
    "frequency": "ročně",
    "organizer": "MŠMT (ve spolupráci s MFF UK)",
    "description": "Celostátní soutěž pro středoškoláky v řešení algoritmických úloh pomocí programování.",
    "target_group": "SŠ"
  }
]
\`\`\`

Return ONLY the JSON array, no other text or markdown outside the code block.`,

  PARTNER_IDENTIFICATION: `You are a partner research specialist. Analyze the provided webpage content and extract sponsors, partners, or supporting organizations related to the given competition.

Return a JSON array. Each item must contain:
- name: string — official organization name
- website: string|null — their website URL if found on the page
- description: string — what kind of partner they are (1–2 sentences)
- type: string — e.g. "generální partner", "mediální partner", "finanční partner", "technologický partner"

If no partners are found on this page, return an empty array [].
Return ONLY the JSON array, no other text.`,

  PARTNER_PROFILING: `You are a due-diligence analyst with live web access. Research the given potential partnership candidate in depth and return a structured JSON report.

Use your web search capability to look for:
1. Their official website — about page, services, mission, target audience
2. LinkedIn company page — employee count, recent posts/news, company updates
3. Instagram and other social media — community events, sponsorships they appear in
4. Press mentions and news articles about their partnerships, sponsorships, prizes
5. Evidence of past involvement in events, competitions, education, or charity
6. Whether the entity is an independent company or a subsidiary/brand of a larger corporation

Return a SINGLE JSON object inside a \`\`\`json code block with this exact structure:

\`\`\`json
{
  "name": "string — official name of the company/organization",
  "website": "string|null — official website URL",
  "linkedinUrl": "string|null — LinkedIn company page URL",
  "instagramUrl": "string|null — Instagram profile URL",
  "industry": "string — primary industry or sector",
  "size": "micro|small|medium|large|enterprise",
  "sizeNote": "string — evidence for the size estimate, e.g. '~120 employees per LinkedIn 2024'",
  "parentCompany": "string|null — if subsidiary, name the parent corporation",
  "summary": "string — 3–5 sentences: what the company does, its positioning and target audience",
  "activities": "string — detailed description of products, services, and key activities",
  "recentHighlights": [
    "string — recent news item, milestone, or notable post (max 5)"
  ],
  "partnershipStyle": [
    "string — e.g. 'generální partner', 'mediální partner', 'finanční sponzor', 'věcné ceny', 'technologický partner'"
  ],
  "partnershipEvidence": [
    {
      "event": "string — name of the event, competition, or charity",
      "role": "string — their role, e.g. 'Generální partner', 'Sponzor cen'",
      "year": "string|null",
      "source": "string|null — URL where this was found"
    }
  ],
  "socialInvolvement": "string — summary of community, educational, or charitable activities",
  "researchNotes": "string — caveats, data gaps, or important context for the researcher"
}
\`\`\`

Size scale: micro = <10, small = 10–50, medium = 50–500, large = 500–5 000, enterprise = >5 000 employees.

IMPORTANT:
- Use live web search to find real, current data.
- If information is not found, use null or [].
- Return ONLY the JSON object inside the code block, no other text outside it.`,

  CONTACT_DISCOVERY: `You are a contact research specialist with live web access. Find specific contacts at the organization using LinkedIn and other public signals. Priority order: PR > HR > Marketing > CEO > Generic contact. Return a JSON array with fields: name, role, email, linkedin, priority (1-5), confidence (high|medium|low).`,

  VALUE_ALIGNMENT: `You are a strategic alignment analyst. Compare the provided selling points with the partner data and rank alignment opportunities by relevance. Return a JSON array with fields: sellingPoint, relevanceScore (0-100), hook (string), reasoning (string).`,

  OUTREACH_PREPARATION: `You are an expert cold-email copywriter. Generate a highly tailored outreach email based on the provided template, contact, and alignment hints. Return a JSON object with fields: to (email address), subject (string), body (plain text).`,
}
