// ═══════════════════════════════════════════════════════════════════════════════
// Outreach configuration — models, prompts, fonts used by the outreach workflow
// ═══════════════════════════════════════════════════════════════════════════════

export function formatSchemaForPrompt(schema: object): string {
  return '```json\n' + JSON.stringify(schema, null, 2) + '\n```'
}

// ── OpenRouter client settings ────────────────────────────────────────────────
export const OPENROUTER = {
  baseURL:   'https://openrouter.ai/api/v1',
  siteUrl:   'https://coldmailer.scg.cz',
  siteTitle: 'SCG ColdMailer',
} as const

// ── Model identifiers ─────────────────────────────────────────────────────────
export const MODELS = {
  CLAUDE_SONNET: 'anthropic/claude-sonnet-5',
  CLAUDE_HAIKU:  'anthropic/claude-haiku-4.5',
} as const

// ── Reasoning effort (OpenRouter `reasoning.effort`) ──────────────────────────
// 'auto' is an app-level sentinel (not sent to OpenRouter) meaning: omit the
// `reasoning` param entirely and let the model's own default thinking behavior apply.
export const REASONING_EFFORT_LEVELS = ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningEffort = typeof REASONING_EFFORT_LEVELS[number]

// Steps whose AI calls go through streamStepAI() and support configurable reasoning effort.
export const REASONING_STEP_TYPES = ['VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'] as const
export type ReasoningStepType = typeof REASONING_STEP_TYPES[number]

export const DEFAULT_REASONING_EFFORT: Record<ReasoningStepType, ReasoningEffort> = {
  VALUE_ALIGNMENT: 'auto',
  OUTREACH_PREPARATION: 'auto',
}

// ── Group → font mapping (used in outreach email generation) ─────────────────
export const GROUP_FONTS: Record<string, string> = {
  tda: 'sans-serif',
  xo:  'Dosis',
  ppt: 'Figtree',
}

// ── Default output schemas per step (read-only, injected via <[[SCHEMA]]>) ───
export const STEP_OUTPUT_SCHEMAS: Record<string, object> = {
  VALUE_ALIGNMENT: {
    partnerSnapshot: 'string – 2–3 věty: kdo je tento partner a na čem mu záleží',
    argumentAlignment: [
      {
        argumentId: 'string – Název ze značky [Název | Důležitost]',
        argumentLabel: 'string – celý název argumentu',
        relevance: 'Vysoká|Střední|Nízká|Nevhodné',
        reasoning: 'string – proč tento argument funguje nebo nefunguje',
        redFlags: 'string|null',
      },
    ],
    topArguments: [
      {
        rank: 1,
        argumentId: 'string',
        whyItFits: 'string – konkrétní důkaz z profilu partnera',
        howToFrame: 'string – doporučený úhel pohledu',
        whatToAvoid: 'string – co neříkat',
      },
    ],
    argumentsToDrop: [
      {
        argumentId: 'string',
        reason: 'string – proč argument vynechat',
      },
    ],
    hookHypothesis: 'string – 1–2 věty: nejpřesvědčivější důvod pro reakci',
    recommendedContact: {
      primary: {
        name: 'string|null',
        role: 'string',
        reasoning: 'string – proč je tato osoba nejlepší první kontakt',
      },
      alternatives: [
        {
          name: 'string|null',
          role: 'string',
          tradeoff: 'string – kdy zvážit tuto osobu',
        },
      ],
    },
    flagsAndRisks: ['string – konkrétní nesoulad nebo citlivost'],
    overallFitScore: 'Vysoký|Střední|Nízký',
    overallFitReasoning: 'string – 2–3 věty shrnující celkovou míru shody',
  },

  OUTREACH_PREPARATION: {
    analysis: {
      recipientProfile: 'string',
      topArgument: 'string',
      hookAnalysis: 'string',
      personalizationDetail: 'string',
      templateConstraints: ['string'],
    },
    to: 'string – e-mailová adresa příjemce; prázdný řetězec pokud není k dispozici',
    subject: 'string',
    body: 'HTML string – formátovaný dle sekce HTML formátování',
    recommendations: ['string – konkrétní doporučení, tip nebo upozornění pro uživatele (3–4 položky)'],
    selfCheck: {
      opensWithPersonalization: true,
      topArgumentPresent: true,
      clearCTA: true,
      templateRespected: true,
      underWordLimit: true,
      noForbiddenPhrases: true,
      htmlFormattingValid: true,
      noSignatureAdded: true,
      variablesHandledNaturally: true,
    },
  },
}

// ── Default system-prompt display names (used by prisma/seed.ts) ──────────────
export const DEFAULT_PROMPT_NAMES: Record<string, string> = {
  VALUE_ALIGNMENT:      'Výchozí',
  OUTREACH_PREPARATION: 'Výchozí',
}

// ── System prompt content ─────────────────────────────────────────────────────
export const STEP_SYSTEM_PROMPTS: Record<string, string> = {
  VALUE_ALIGNMENT: `Jsi expert na partnerský business development a hodnocení strategické shody mezi organizacemi.

Dostaneš tři vstupy:
1. Kontext naší organizace a soutěže
2. Strukturovaný profil potenciálního partnera (výstup z due diligence fáze)
3. Seznam prodejních argumentů, které můžeme partnerovi nabídnout

Každý argument ve vstupním seznamu může začínat značkou ve formátu [Název | Důležitost], např.:
- [Nábor talentů | Klíčový] Snadnější hiring a přístup k technickým talentům…
Název použij jako argumentId ve výstupu. Důležitost (např. Klíčový, Vysoký, Střední, Doplňkový) zohledni při hodnocení relevance – klíčové argumenty by měly mít větší váhu při výběru do pole topArguments, pokud profil partnera vykazuje alespoň částečnou shodu.

Tvým úkolem je provést hloubkovou analýzu hodnot a zájmů partnera a zjistit, které z našich argumentů mají pro tohoto konkrétního partnera největší rezonanci. Nepiš e-mail ani outreach zprávu – to přijde v dalším kroku. Soustřeď se výhradně na analýzu a alignment.

Při hodnocení ber v potaz:
- Skutečné priority a zájmy partnera na základě jeho profilových dat, ne jen jeho odvětví
- Důkazy o předchozím partnerství, sponzorství nebo komunitních aktivitách
- Typ kontaktní osoby, která bude e-mail číst, a jak se její agenda liší od ostatních
- Geografický, kulturní nebo regulatorní kontext, který může ovlivnit relevanci argumentů
- Timing – existuje aktuální důvod, proč by partner mohl být otevřenější právě teď?

DŮLEŽITÉ:
- Každý argument hodnoť na základě dat z profilu partnera, ne obecných předpokladů.
- Pokud v profilu chybí data potřebná pro hodnocení, explicitně to uveď v poli reasoning nebo flagsAndRisks – nedomýšlej si.
- hookHypothesis musí být specifická pro tohoto partnera a tento moment – ne generická fráze.
- Vyber a seřaď přesně 3 nejrelevantnější argumenty do pole topArguments (rank 1–3).
- Pokud jsou v profilu partnera kontaktní osoby různých typů, recommendedContact zohledni typ argumentů v topArguments (např. HR argument → HR kontakt, CSR argument → PR nebo CEO).
- Vrať POUZE JSON objekt uvnitř bloku kódu, bez jiného textu mimo něj.
- Výstup bude v češtině.

## VSTUPNÍ DATA
<[[DATA]]>

## VÝSTUP

Vrať JEDEN JSON objekt uvnitř \`\`\`json bloku s touto přesnou strukturou:

<[[SCHEMA]]>`,

  OUTREACH_PREPARATION: `Jsi expert na psaní cold e-mailů. Vytvoř vysoce přizpůsobený oslovovací e-mail na základě poskytnuté šablony, kontaktu a náznakůsouladu.

<[[DATA]]>

Odesílatel (jméno osoby, která e-mail odesílá):

<[[USER]]>

<[[CONTEXT]]>

<[[TEMPLATE]]>

## VÝSTUP

Vrať JSON objekt s touto přesnou strukturou:

<[[SCHEMA]]>`,
}
