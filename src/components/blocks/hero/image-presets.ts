// One-click presets shown behind a Styles / Scenes tab switch. Each preset
// carries a thumbnail (hosted on our R2), a short description for the template
// gallery, and a prompt template. The `[SUBJECT]` token is replaced with the
// user's typed prompt at submit time. Labels and descriptions stay as English
// brand-like terms across locales.
const PRESET_IMG = 'https://assets.gemini-omni.video/presets';

export interface ImagePreset {
  id: string;
  label: string;
  description: string;
  image: string;
  prompt: string;
}

export const STYLE_PRESETS: readonly ImagePreset[] = [
  {
    id: 'sticker-pack',
    label: 'Sticker Pack',
    description: 'Die-cut vinyl stickers',
    image: `${PRESET_IMG}/sticker.webp`,
    prompt:
      'Turn [SUBJECT] into a die-cut vinyl sticker pack. Nine stickers in different poses and expressions, thick white border around each, glossy finish, bold clean outlines, vibrant colors, flat-lay layout on a soft pastel background.',
  },
  {
    id: 'enamel-pin',
    label: 'Enamel Pin',
    description: 'Hard enamel collector badge',
    image: `${PRESET_IMG}/enamel-pin.webp`,
    prompt:
      'Reimagine [SUBJECT] as a hard enamel pin badge. Gold metal outlines, jewel-tone enamel fill, clean iconic silhouette, subtle specular highlights, displayed on a black velvet backing card. Studio macro photography.',
  },
  {
    id: 'plushie',
    label: 'Plushie',
    description: 'Soft huggable toy',
    image: `${PRESET_IMG}/plushie.webp`,
    prompt:
      'Turn [SUBJECT] into a soft plushie toy. Rounded chibi proportions, fuzzy fabric texture, visible stitching seams, felt details, big shiny embroidered eyes, sitting on a pastel studio backdrop. Cozy product photography.',
  },
  {
    id: 'collectible-figure',
    label: 'Collectible Figure',
    description: 'Vinyl figure on display base',
    image: `${PRESET_IMG}/toy-figure.webp`,
    prompt:
      'Turn [SUBJECT] into a 1/7 scale collectible vinyl figure standing on a round transparent base. Behind it, place a printed product box showing the same character, and a computer screen displaying the Blender modeling process. Indoor studio, glossy paint finish, intricate sculpted details.',
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Japanese animation cel',
    image: `${PRESET_IMG}/anime.webp`,
    prompt:
      'Redraw [SUBJECT] in modern anime style. Clean confident line art, flat cel shading, vibrant colors, expressive eyes, dynamic sunset lighting with lens flare. Studio Ghibli meets modern shonen aesthetic.',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    description: 'Loose painterly wash',
    image: `${PRESET_IMG}/watercolor.webp`,
    prompt:
      'Paint [SUBJECT] as a loose watercolor illustration. Wet-on-wet color bleeds, visible cold-press paper texture, delicate ink outlines, pastel palette, generous white negative space, hand-painted fine art feel.',
  },
  {
    id: 'vintage-poster',
    label: 'Vintage Poster',
    description: '1950s travel print',
    image: `${PRESET_IMG}/poster.webp`,
    prompt:
      'Design a 1950s vintage travel poster featuring [SUBJECT]. Stylized flat illustration, limited four-color screen-print palette, bold sans-serif title banner, subtle paper grain and aging, art-deco composition.',
  },
  {
    id: 'product-mockup',
    label: 'Product Mockup',
    description: 'Clean studio commercial render',
    image: `${PRESET_IMG}/product-mockup.webp`,
    prompt:
      'Render [SUBJECT] as a hyper-realistic commercial product shot. Floating on a seamless studio backdrop with soft directional lighting, subtle contact shadow, crisp reflections, clean premium advertising aesthetic.',
  },
];

export const SCENE_PRESETS: readonly ImagePreset[] = [
  {
    id: 'tokyo-street',
    label: 'Tokyo Street',
    description: 'Neon-soaked night alley',
    image: `${PRESET_IMG}/tokyo-street.webp`,
    prompt:
      'Place [SUBJECT] on a bustling Tokyo alley at night. Neon kanji signs reflecting on wet pavement, motion-blurred pedestrians, warm tungsten streetlights, cinematic shallow depth of field, shot on 35mm film.',
  },
  {
    id: 'studio-shot',
    label: 'Studio Shot',
    description: 'Seamless portrait backdrop',
    image: `${PRESET_IMG}/studio-shot.webp`,
    prompt:
      'Photograph [SUBJECT] against a seamless paper studio backdrop in a soft dusty-pink tone. Large octa softbox key light from the left, subtle rim light from behind, professional editorial studio photography, medium-format crispness.',
  },
  {
    id: 'toy-packaging',
    label: 'Toy Packaging',
    description: 'Retail blister-box display',
    image: `${PRESET_IMG}/toy-packaging.webp`,
    prompt:
      'Package [SUBJECT] as a retail blister-box collectible. Cardboard backing with colorful printed artwork, bold comic-style product name, clear plastic bubble over the figure, hanging tab on top, photographed on a toy-shop shelf with soft bokeh.',
  },
  {
    id: 'fashion-editorial',
    label: 'Fashion Editorial',
    description: 'Magazine spread',
    image: `${PRESET_IMG}/fashion-editorial.webp`,
    prompt:
      'Shoot [SUBJECT] as a high-fashion editorial portrait against a brutalist concrete wall. Hard directional sunlight, sharp graphic shadows, muted tonal grade, Mamiya 645 medium-format look, generous negative space for magazine headline.',
  },
  {
    id: 'product-ad',
    label: 'Product Ad',
    description: 'Cinematic hero frame',
    image: `${PRESET_IMG}/product-ad.webp`,
    prompt:
      'Create a cinematic hero advertisement frame for [SUBJECT]. Product levitating in slow-motion with dynamic particles around it, dramatic rim lighting, deep gradient background, volumetric light shafts, ultra-sharp macro focus, bold centered composition.',
  },
  {
    id: 'cinematic-interior',
    label: 'Cinematic Interior',
    description: 'Warm golden-hour room',
    image: `${PRESET_IMG}/cinematic-interior.webp`,
    prompt:
      'Place [SUBJECT] in a warm mid-century modern interior at golden hour. Sunlight streaming through sheer curtains, dust particles in the air, vintage furniture, cinematic wide lens, teal-and-orange color grade, shallow depth of field.',
  },
];

// Total templates exposed in the "Browse N templates" gallery entry point.
export const TEMPLATE_COUNT = STYLE_PRESETS.length + SCENE_PRESETS.length;
