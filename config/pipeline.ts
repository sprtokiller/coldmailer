// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline configuration — single source of truth for models, prompts, UI badges
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
  DEEP_RESEARCH: 'openai/o4-mini-deep-research',
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4.6',
  CLAUDE_HAIKU:  'anthropic/claude-haiku-4.5',
  PIPELINE:      'pipeline',  // SerpAPI + Playwright + AI (display only)
} as const
 
// ── Step → model mapping ──────────────────────────────────────────────────────
export const STEP_MODEL: Record<string, string> = {
  MARKET_SCANNING:        MODELS.DEEP_RESEARCH,
  PARTNER_IDENTIFICATION: MODELS.PIPELINE,
  PARTNER_PROFILING:      MODELS.DEEP_RESEARCH,

  VALUE_ALIGNMENT:        MODELS.CLAUDE_SONNET,
  OUTREACH_PREPARATION:   MODELS.CLAUDE_SONNET,
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
  [MODELS.CLAUDE_SONNET]: { label: 'Claude Sonnet 4.5',         cls: 'bg-emerald-100 text-emerald-700' },
  [MODELS.PIPELINE]:      { label: 'SerpAPI + Playwright + AI', cls: 'bg-violet-100 text-violet-700'  },
}

// ── Group → font mapping (used in outreach email generation) ─────────────────
export const GROUP_FONTS: Record<string, string> = {
  tda: 'Inter Tight',
  xo:  'Dosis',
  ppt: 'Figtree',
}

// ── Default output schemas per step (read-only, injected via <[[SCHEMA]]>) ───
export const STEP_OUTPUT_SCHEMAS: Record<string, object> = {
  MARKET_SCANNING: [
    {
      url: 'string — domovská stránka soutěže/akce/kanálu',
      name: 'string — plný oficiální název (v původním jazyce)',
      type: 'string — kategorie, např. "programování", "matematika", "robotika"',
      level: 'string — jedno z "lokální" | "regionální" | "národní" | "mezinárodní"',
      status: 'string — jedno z "aktivní" | "neaktivní" | "neznámé"',
      frequency: 'string — např. "ročně", "pololetně", "jednorázová"',
      organizer: 'string — název pořádající instituce',
      description: 'string — 1–2 věty popisující soutěž a co účastníci dělají',
      target_group: 'string — primární cílová skupina, např. "SŠ", "ZŠ", "SŠ+ZŠ"',
    },
  ],

  PARTNER_IDENTIFICATION: [
    {
      name: 'string — oficiální název organizace',
      website: 'string|null — URL jejich webu, pokud je na stránce uvedena',
      description: 'string — jaký typ partnera jsou (1–2 věty)',
      type: 'string — např. "generální partner", "mediální partner"',
    },
  ],

  PARTNER_PROFILING: {
    name: 'string – oficiální název společnosti/organizace',
    website: 'string|null – URL oficiálního webu',
    linkedinUrl: 'string|null – URL firemní stránky na LinkedIn',
    instagramUrl: 'string|null – URL profilu na Instagramu',
    industry: 'string – primární odvětví nebo sektor',
    size: 'micro|small|medium|large|enterprise',
    sizeNote: 'string – doklad pro odhad velikosti',
    parentCompany: 'string|null – pokud jde o dceřinou firmu, uveď mateřskou korporaci',
    summary: 'string – 3–5 vět: co firma dělá, její pozicování a cílová skupina',
    activities: 'string – podrobný popis produktů, služeb a klíčových aktivit',
    recentHighlights: ['string – nedávná novinka, milník nebo pozoruhodný příspěvek, max 5 položek'],
    contacts: [
      {
        firstName: 'string|null',
        lastName: 'string|null',
        role: 'string|null',
        email: 'string|null',
        linkedin: 'string|null',
        alternativeContact: 'string|null',
        type: 'PR|HR|Marketing|CEO|General',
        priority: 1,
        confidence: 'High|Medium|Low',
        source: 'string – URL zdroje',
        sourceDate: 'string|null',
        note: 'string – stručně vysvětli, proč je kontakt relevantní',
      },
    ],
    partnershipStyle: ['string – např. "generální partner", "mediální partner"'],
    partnershipEvidence: [
      {
        event: 'string – název akce, soutěže nebo charity',
        role: 'string – jejich role',
        year: 'string|null',
        source: 'string|null – URL zdroje',
      },
    ],
    socialInvolvement: 'string – shrnutí komunitních, vzdělávacích nebo charitativních aktivit',
    researchNotes: 'string – výhrady, mezery v datech nebo důležitý kontext',
  },

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
    top3Arguments: [
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
  MARKET_SCANNING:        'Výchozí',
  PARTNER_IDENTIFICATION: 'Výchozí',
  PARTNER_PROFILING:      'Výchozí',

  VALUE_ALIGNMENT:        'Výchozí',
  OUTREACH_PREPARATION:   'Výchozí',
}

// ── System prompt content ─────────────────────────────────────────────────────
export const STEP_SYSTEM_PROMPTS: Record<string, string> = {
MARKET_SCANNING: `Jsi expert na průzkum trhu s přímým přístupem k internetu. Vyhledej středoškolské soutěže, akce a kanály aktivní v České republice. Využij svou schopnost prohledávat web k nalezení skutečných, aktuálních příkladů.

<[[DATA]]>

Vrať JSON pole. Každá položka musí obsahovat přesně tato pole dle schématu níže.

## VÝSTUP

<[[SCHEMA]]>

Vrať POUZE JSON pole, bez jiného textu nebo markdownu mimo blok kódu.`,

  PARTNER_IDENTIFICATION: `Jsi specialista na průzkum partnerů. Analyzuj obsah poskytnuté webové stránky a vytěž sponzory, partnery nebo podpůrné organizace spojené s danou soutěží.

<[[DATA]]>

Pokud na stránce nejsou nalezeni žádní partneři, vrať prázdné pole [].
Vrať POUZE JSON pole, bez jiného textu.

## VÝSTUP

<[[SCHEMA]]>`,

  PARTNER_PROFILING: `Jsi analytik due diligence s přímým přístupem k internetu. Proveď hloubkový průzkum zadaného potenciálního partnerského kandidáta a vrať strukturovanou JSON zprávu.

Prohledej pomocí webového vyhledávání:
1. Oficiální web – O nás, služby, mise, cílová skupina, kontakty, tým, tiskové oddělení
2. Firemní LinkedIn – velikost firmy, aktuální příspěvky, zaměstnanci, relevantní kontaktní osoby
3. LinkedIn profily konkrétních lidí – PR, HR, marketing, vedení
4. Instagram a další sociální sítě – komunitní akce, sponzorství, eventy
5. Tiskové zprávy, články, rozhovory, podcasty, konference a veřejné výstupy
6. Veřejné rejstříky a databáze – ověření jednatelů, vlastníků nebo mateřské společnosti
7. Důkazy o účasti na akcích, soutěžích, vzdělávání, komunitních nebo charitativních aktivitách

Zvlášť se zaměř na nalezení kontaktů. Hledej více unikátních kontaktů, ale pouze takové, u kterých existuje rozumný veřejný zdroj.

Kontakty vyhledávej v tomto pořadí podle priority:
1. PR / komunikace / media relations / tiskové oddělení
2. HR / People / Talent / lidské zdroje
3. Marketing / brand / partnerships / events
4. CEO / jednatel / founder / owner / managing director
5. Obecný kontakt – info@, hello@, contact@ apod.

U každého kontaktu:
- uveď jméno a příjmení, pokud je dohledatelné,
- uveď pracovní pozici,
- uveď e-mail, pokud je veřejně uvedený,
- uveď LinkedIn nebo jiný relevantní veřejný profil, pokud je dostupný,
- zařaď kontakt do typu PR, HR, Marketing, CEO nebo General,
- uveď prioritu podle výše uvedeného pořadí,
- uveď míru jistoty High / Medium / Low,
- uveď URL zdroje,
- preferuj aktuální zdroje; pokud je zdroj starší než 3 roky, sniž confidence, pokud není potvrzen i jinde.

Pokud najdeš pouze lead, například osoba publikovala tiskovou zprávu, vystoupila v podcastu, organizovala event nebo je uvedena jako media kontakt, můžeš ji zařadit jako kandidátní kontakt, ale označ confidence jako Medium nebo Low podle síly důkazu.

Škála velikosti:
- micro = <10 zaměstnanců
- small = 10–50 zaměstnanců
- medium = 50–500 zaměstnanců
- large = 500–5 000 zaměstnanců
- enterprise = >5 000 zaměstnanců

DŮLEŽITÉ:
- Použij živé vyhledávání na webu k nalezení skutečných a aktuálních dat.
- Nehádej e-maily podle vzoru firmy, pokud nejsou veřejně doložené.
- Nepoužívej osobní e-mail, pokud není veřejně uveden v pracovním kontextu.
- Kontakty musí být unikátní; neduplikuj stejnou osobu ani stejný obecný e-mail.
- Pokud informace nejsou nalezeny, použij null nebo [].
- Pokud najdeš jen obecný info mail, uveď ho jako type = "General", priority = 5.
- Seřaď contacts podle priority vzestupně a potom podle confidence od High po Low.
- Vrať POUZE JSON objekt uvnitř bloku kódu, bez jiného textu mimo něj.
- Výstup bude v češtině.

## VSTUPNÍ DATA
<[[DATA]]>

## VÝSTUP

Vrať JEDEN JSON objekt uvnitř \`\`\`json bloku s touto přesnou strukturou:

<[[SCHEMA]]>`,

  VALUE_ALIGNMENT: `Jsi expert na partnerský business development a hodnocení strategické shody mezi organizacemi.

Dostaneš tři vstupy:
1. Kontext naší organizace a soutěže
2. Strukturovaný profil potenciálního partnera (výstup z due diligence fáze)
3. Seznam prodejních argumentů, které můžeme partnerovi nabídnout

Každý argument ve vstupním seznamu může začínat značkou ve formátu [Název | Důležitost], např.:
- [Nábor talentů | Klíčový] Snadnější hiring a přístup k technickým talentům…
Název použij jako argumentId ve výstupu. Důležitost (např. Klíčový, Vysoký, Střední, Doplňkový) zohledni při hodnocení relevance – klíčové argumenty by měly mít větší váhu v top3 výběru, pokud profil partnera vykazuje alespoň částečnou shodu.

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
- Pokud jsou v profilu partnera kontaktní osoby různých typů, recommendedContact zohledni typ argumentů v top3 (např. HR argument → HR kontakt, CSR argument → PR nebo CEO).
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
