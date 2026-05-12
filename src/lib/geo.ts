const CN_REGIONS = new Set(['CN', 'HK', 'MO', 'TW']);

export type ChinaSignal = 'ip' | 'lang' | 'prompt' | null;

export interface ChinaDetection {
  isChina: boolean;
  reason: ChinaSignal;
  country: string | null;
}

export function detectChinaUser(input: {
  headers: Headers;
  prompt?: string | null;
}): ChinaDetection {
  const country =
    (input.headers.get('cf-ipcountry') ?? '').toUpperCase() || null;
  if (country && CN_REGIONS.has(country)) {
    return { isChina: true, reason: 'ip', country };
  }

  const lang = (input.headers.get('accept-language') ?? '').toLowerCase();
  if (/^\s*zh(\b|-|;|,)/.test(lang)) {
    return { isChina: true, reason: 'lang', country };
  }

  const p = input.prompt ?? '';
  if (p.length >= 4) {
    // CJK Unified Ideographs (`一-鿿`, U+4E00..U+9FBF) overlaps Japanese
    // kanji. To avoid misclassifying JP prompts as Chinese, the prompt
    // must (a) be at least 30% Han characters AND (b) contain no
    // hiragana / katakana — those exclusively mark Japanese text.
    const hasJpKana = /[぀-ゟ゠-ヿ]/.test(p);
    if (!hasJpKana) {
      const cn = (p.match(/[一-鿿]/g)?.length ?? 0) / p.length;
      if (cn >= 0.3) {
        return { isChina: true, reason: 'prompt', country };
      }
    }
  }

  return { isChina: false, reason: null, country };
}
