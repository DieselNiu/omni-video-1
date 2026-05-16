export interface NudifyIntentResult {
  flagged: boolean;
  matched?: string;
}

const LATIN_PATTERNS: RegExp[] = [
  /\bnudes?\b/i,
  /\bnudity\b/i,
  /\bnaked\b/i,
  /\btopless\b/i,
  /\bbottomless\b/i,
  /\bundress(ed|ing)?\b/i,
  /\bdisrobe(d|ing)?\b/i,
  /\bstrip(?:ped|ping)?\s+(?:naked|nude|down|her|him|them|off)\b/i,
  /\bunclothed?\b/i,
  /\bbare[-\s]?(skin|body|chest|breasts?|naked)\b/i,
  /\b(remove|take[-\s]?off|pull[-\s]?off|rip[-\s]?off|lose|get\s+rid\s+of|shed|unbutton|unzip)\s+([\w']+\s+){0,4}(clothes?|clothing|cloth|shirt|tshirt|t-shirt|dress|pants|trousers|shorts|skirt|underwear|bra|panties|top|bottom|outfit|garments|uniform|jacket|coat|sweater|hoodie|blouse|saree|sari|bikini|swimsuit)\b/i,
  /\b(no|without)\s+clothes?\b/i,
  // Lingerie / underwear conversion (e.g. "convert clothes into bra and panty", "wearing a white bikini")
  /\b(into|wearing|wears|in|to)\s+(a\s+|the\s+)?(\w+\s+){0,3}(bra|panty|panties|thong|g[-\s]?string|lingerie|bikini|micro[-\s]?bikini)\b/i,
  /\b(bra\s+and\s+pant(y|ies))\b/i,
  // Sexual modifications
  /\b(make|making)\s+\w+\s+(breasts?|boobs?|tits?|butt|ass)\s+(bigger|larger|twice|huge)/i,
  /\b(hard|erect)\s+(dick|cock|penis)\b/i,
  // Leetspeak
  /\bnak[3e]d\b/i,
  // Sexualized body part terms
  /\b(boobs?|tits|titties|booty|cleavage|cameltoe|bare\s+bottom|bare\s+butt|bare\s+ass)\b/i,
  // Sexual content / hentai terms
  /\b(ahegao|cum\s+(shot|on|in)|orgasm|blowjob|handjob|threesome|gangbang)\b/i,
  // Vietnamese
  /\bkho[ảa]\s*th[âa]n\b/i,
  // Hungarian
  /\bmeztelen(?:[üu]l)?\b/i,
  // Indonesian / Malay
  /\btelanjang\b/i,
  // Italian
  /\bnud[ao]s?\b(?=\s+(corpo|donna|uomo|ragazza|ragazzo))/i,
  /\bspogliat[oa]\b/i,
  /\bnipples?\b/i,
  /\bgenitals?\b/i,
  /\bvagina\b/i,
  /\bpenis\b/i,
  /\bpussy\b/i,
  /\bporn(o|ography)?\b/i,
  /\bnsfw\b/i,
  /\bhentai\b/i,
  /\blewd\b/i,
  /\berotic(a|ally)?\b/i,
  /\bsexual(ly|ize|ized|izing)?\b/i,
  /\bdeepnude\b/i,
  /\bnudify\b/i,
  // Spanish (covers desnuda/desnudo/desnudar/desnudala/desnúdate)
  /\bdesnud[aoeáú]\w{0,5}\b/i,
  /\bsin\s+ropa\b/i,
  // Indonesian / Malay (melepaskan pakaian = remove clothes)
  /\bmelepas\w*\s+(pakaian|baju)\b/i,
  // Portuguese
  /\bpelad[oa]s?\b/i,
  /\bsem\s+roupa\b/i,
  /\bnu[ae]?s?\b(?=\s+(corpo|mulher|homem|menina))/i,
  // French
  /\bd[ée]shabill[eé]e?s?\b/i,
  /\bsans\s+v[êe]tements?\b/i,
  // German
  /\bnackt\b/i,
  /\bausziehen\b/i,
  /\bentkleide[nt]?\b/i,
  // Russian / Ukrainian (Cyrillic — match by non-letter boundary since \b is unreliable)
  /(^|[^\p{L}])(гол(ый|ая|ого|ую|ые|ыми)|обнаж[её]нн?(ый|ая|ые)|раздева(ться|ется|й|йся|ние)|разде(нь|ться)|до\s+гола|убери.{0,15}одежд|сним(и|ите).{0,15}одежд)([^\p{L}]|$)/iu,
  // Portuguese — lingerie / thong specifics
  /\bcalcinha\b/i,
  /\bfio\s+dental\b/i,
];

const CJK_PATTERNS: RegExp[] = [
  // Chinese: 脱X (脱衣/脱裤/脱裙/脱光/脱掉/脱内衣/脱下衣服 ...)
  /脱[^。，,.\s]{0,4}(衣|裤|裙|内衣|内裤|光|掉|了)/,
  // Chinese: 裸X (裸体/裸照/裸露/裸胸/裸身/裸男/裸女/裸奔) + 前缀 (全裸/半裸/赤裸/全身裸)
  /(全|半|赤|全身)裸/,
  /裸(体|照|露|胸|身|男|女|奔|聊|战)/,
  // Chinese: 露X (露点/露乳/露胸/露出私处)
  /露(点|乳|胸|出.{0,3}(私|胸|乳))/,
  // Chinese: 透视装 / 走光 / 三点
  /透视(装|衣|服)/,
  /走光/,
  /三点(全露|尽露)/,
  // Chinese: 无码/无修正/涩图/黄图/色情/乳头/阴部/私处/下体
  /(无码|無修正|涩图|黄图|色情|乳头|乳首|阴部|私处|下体)/,
  // Japanese
  /(ヌード|エロ|おっぱい|全裸|半裸|裸体|ア[へヘ]顔|アヘ顔|マイクロビキニ)/,
  /服\s*を\s*脱/,
  /(ブラ(ジャー)?|パンツ|下着|ショーツ)\s*を\s*脱/,
  /服\s*が\s*消え/,
  /何\s*も\s*着\s*て\s*(い|な)/,
  /下着姿/,
  // Korean
  /(누드|알몸)/,
  /옷\s*벗/,
  /벗기[다겨]/,
];

export function detectNudifyIntent(prompt?: string): NudifyIntentResult {
  if (!prompt) return { flagged: false };
  const normalized = prompt.normalize('NFKC');

  for (const re of LATIN_PATTERNS) {
    const m = normalized.match(re);
    if (m) return { flagged: true, matched: m[0] };
  }
  for (const re of CJK_PATTERNS) {
    const m = normalized.match(re);
    if (m) return { flagged: true, matched: m[0] };
  }
  return { flagged: false };
}
