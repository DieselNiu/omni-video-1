import type { MediaItem } from '../types';

/**
 * Demo Media Data - 20 items (19 videos + 1 image)
 *
 * R2 URL FORMAT (Replace these placeholders):
 *   - Videos: https://your-r2-domain.com/bucket/videos/your-video.mp4
 *   - Thumbnails: https://your-r2-domain.com/bucket/thumbnails/your-thumb.jpg
 *   - Images: https://your-r2-domain.com/bucket/images/your-image.jpg
 *
 * ASPECT RATIOS:
 *   - '1:1' = Square (正方形)
 *   - '16:9' = Landscape (横屏)
 *   - '9:16' = Portrait (竖屏)
 *   - '4:3' = Classic (经典比例)
 *   - '3:2' = Photo (照片比例)
 */

export const DEMO_MEDIA: MediaItem[] = [
  // Videos (id: 1-5)
  {
    id: '1',
    src: 'https://assets.movart.ai/gallery/1.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/1.png',
    type: 'video',
    prompt:
      'A dynamic cinematic styled like a 1970s Japanese tokusatsu battle scene. Two giant rubber-suit monsters clash in the middle of a destroyed miniature city set. a giant purple monster walks into the movie set each step shakes the scene the monster poses angry The environment is a detailed miniature downtown: crumbling model buildings, scattered rubble, toy cars, smoke plumes, and broken street lamps. The scale feels large but clearly practical and handmade. Shot from a slightly low Dutch angle to emphasize size and heroism. The background features a dramatic painted sunset sky with stylized clouds in purples, oranges, and deep blues. Lighting is strong and theatrical, with studio spotlights creating dramatic highlights and deep shadows across the rubber suits. The overall look mimics vintage practical effects: visible seams, suit wrinkles, matte textures, chunky miniatures, and practical fire/smoke elements. Captured with a retro 35mm tokusatsu aesthetic: vivid saturated colors, slight grain, mild softness at the edges, and the charming imperfection of old special-effects shows. The moment shows both monsters mid-fight, poised for impact, full of energy and vintage cinematic flair',
    resolution: '1080p (Full HD)',
    aspectRatio: '16:9',
    model: 'veo3.1',
  },
  {
    id: '2',
    src: 'https://assets.movart.ai/gallery/2.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/2.png',
    type: 'video',
    prompt:
      'a neon lamp in the shape of two lily flowers, with rainbow colors against a black background, in the style of hyper-realistic photography.',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '3',
    src: 'https://assets.movart.ai/gallery/3.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/3.png',
    type: 'video',
    prompt:
      'a lone shopping cart overflowing with groceries cereal boxes plastic bottles produce paper bags all catching fire fully engulfed in bright orange flames in the center of an empty nighttime parking lot wet glossy asphalt reflecting vivid orange firelight and cool blue streetlamp tones tall street lamps casting crisp shadows and clean highlights a retro 1980s supermarket in the background with bright neon signage and glowing fluorescent interior lights bold geometric storefront design with perfectly clear visibility ultra-cinematic composition high-detail metal cart wires glowing from heat groceries burning with realistic textures and melting plastics strong color contrast between warm fire and cool night tones hyper-realistic dramatic lighting',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '4',
    src: 'https://assets.movart.ai/gallery/4.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/4.png',
    type: 'video',
    prompt:
      'starting strictly from the provided reference frame the scene animates as if memory is being dragged through glass. motion does not begin cleanly but smears into existence with edges of the frame intermittently appearing and disappearing through soft mirror-like distortion. movement feels delayed behind itself as if perception trails the action by a fraction of a second. all motion is unified by open-shutter optical blur and echo persistence. shapes stretch duplicate faintly and dissolve back into themselves rather than cutting or fading. no literal fade-ins or fade-outs. instead elements emerge and retreat through smearing reflections refracted glass behavior and implied exposure drift. the image feels observed through layered panes of glass or a slightly intoxicated dream state. highlights bloom gently without flares. blacks remain soft and lifted. surfaces are matte and non-reflective. no sharp edges ever fully resolve. the camera presence is calm and deliberate. motion is smooth continuous and weighted never jittery or handheld. if the subject moves the world lags behind it optically. if the camera moves it glides slowly and steadily with no bounce or shake. the environment remains abstracted and unfocused prioritizing motion impression over detail. edges smear outward then collapse inward. reflections feel internal not mirror-perfect. distortion is organic and analog never digital or glitchy. color grading remains locked to the source image. no added contrast. no saturation boost. slightly desaturated cinematic analog film texture with subtle grain and softness. overall look: blur-heavy dreamlike optical and cinematic. everything feels implied rather than fully seen. Negative guidance (important): no lens flares no light streaks no sharp focus snaps no digital glitches no neon glow no literal dissolves no hard cuts no camera shake no modern HDR look',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '5',
    src: 'https://assets.movart.ai/gallery/5.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/5.png',
    type: 'video',
    prompt:
      'a woman, wearing vintage clothes, navy blue pants and green wide shirt running, surrounded by blurred cars speeding past, motion blur streaks in red, orange, and green tones, captured at low shutter speed, cinematic composition, natural daylight, emotional contrast between stillness and chaos, soft warm lighting, vintage city cars, nostalgic atmosphere, minimalist beige wall in background, expressive body language, realistic urban environment, shallow depth of field, photorealistic, cinematic realism, poetic storytelling in one frame, inspired by fine art photography. Camera Tracking her as she runs',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '6',
    src: 'https://assets.movart.ai/gallery/6.jpg',
    type: 'image',
    prompt:
      'surreal dark-humor cinematic medium shot set in a dimly lit living room with dark green walls a young boy slumped face-first into a large frosted birthday cake on a coffee table framed from mid-torso up head gently buried in the icing in a playful non-distressing way shoulders and upper arms visible birthday candles still standing upright and lit wax slowly dripping flames steady and warm the contrast between celebration and quiet overwhelm creating an ironic cinematic mood the boy wearing a slightly crooked cone-shaped party hat confetti and cake crumbs scattered across the table one small hand resting limply near the cake edge subtle birthday decorations in the background—a few deflated balloons a loosely hanging paper garland and a partially visible birthday banner—softly out of focus against the dark green walls cozy domestic elements like a sofa and lamp blending into shadow low-key cinematic lighting with a warm practical lamp and gentle fill deep shadows and controlled highlights sculpting the subject rich textures in frosting candle wax fabric and wood restrained color palette dominated by dark greens and warm ambers shallow depth of field subtle film grain frozen moment of anticlimax and darkly playful humor photorealistic cinematic stillness no text no graphics no watermark',
    resolution: '2048 x 2048 px',
    aspectRatio: '1:1',
    isImage: true,
    model: 'Nano Banana Pro',
  },
  {
    id: '7',
    src: 'https://assets.movart.ai/gallery/7.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/7.png',
    type: 'video',
    prompt:
      'Inside a small convenience store at night viewed from a fixed overhead CCTV camera with a wide-angle lens the scene appears as low-resolution surveillance footage with visible compression artifacts optical softness mild distortion and uneven fluorescent lighting. The camera remains completely static and elevated capturing narrow aisles stocked shelves and the checkout counter at the back. The image maintains baked-in blur grain and color noise consistent with security camera recordings. At the center of the frame a young woman stands beneath the camera holding her phone up toward her face while using the CCTV view to take selfies. She shifts her weight subtly from one leg to the other adjusting her stance and posture so her body angle changes slightly over time. She turns her shoulders briefly into a side profile then back toward the camera experimenting with framing while keeping her face partially hidden behind the phone. At moments she raises her free hand to make simple gestures such as a V sign with her fingers holding the pose briefly before lowering her hand and adjusting the phone angle again. Her movements are small deliberate and casual creating continuous motion without revealing clear facial detail. In the background store activity continues naturally and independently: the cashier and a customer interact at the counter items are handled and exchanged and another person further down an aisle adjusts products on a shelf. These background actions remain understated and secondary never acknowledging the camera or the woman. All motion feels natural and unforced with the surveillance aesthetic preserved throughout. The visual quality remains soft',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '8',
    src: 'https://assets.movart.ai/gallery/8.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/8.png',
    type: 'video',
    prompt:
      'realistic sleeping child on pillow nighttime bedroom seven realistic sheep floating above the head inside a soft translucent dream cloud gentle motion subtle blur trails cinematic moody lighting calm color palette extremely detailed sheep fur and faces peaceful bedtime atmosphere magical realism photoreal soft volumetric glow. the sheeps are hovering above her head',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '9',
    src: 'https://assets.movart.ai/gallery/9.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/9.png',
    type: 'video',
    prompt:
      'A highly cinematic 9:16 drone-style fly-through of a dense futuristic–retro Chinese cityscape. Muted pastel colors soft teal and beige tones diffused midday lighting with gentle haze. The city is packed with retro tiled buildings weathered concrete neon Chinese signs stacked balconies rooftop additions rusted water tanks pastel cyberpunk towers and narrow vertical alleys. The camera moves like a small agile drone — not on a straight path. It banks slightly as it turns corners dips downward into an alley rises between tall buildings gently curves left and right and weaves organically through the environment. Smooth but dynamic FPV-style motion with subtle micro-vibrations and natural momentum. As the drone passes balconies and signage the parallax shifts richly. Neon lights flicker softly. Steam vents and floating dust catch the light. The atmosphere is dreamy muted cinematic with soft bloom and painterly realism. Color palette: pastel teal warm beige pale pink patina green desaturated yellow. Lighting: soft hazy filmic low contrast. Visual style: hyper-real yet painterly like the uploaded image — same softness same muted tones same cinematic mood.',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '10',
    src: 'https://assets.movart.ai/gallery/10.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/10.png',
    type: 'video',
    prompt:
      'A powerful aging man sits alone at a desk in a modernist office. He wears a tailored dark suit perfectly composed his posture calm and authoritative. A lit cigarette rests between his fingers smoke curling slowly into the air. His face is unreadable at first — stoic practiced distant. Off-screen to camera right something violent unfolds. We never see it. We only hear the faint suggestion — movement a muffled struggle a sharp final sound. The man does not turn his head. His gaze stays fixed forward eyes slightly unfocused as if watching through memory rather than sight. A sudden fine spray of blood lands on his shirt cuff and lapel — subtle almost abstract. The contrast against the fabric is immediate and disturbing. He notices it a beat later. His expression tightens. Not fear — disgust. His eyelids squeeze shut for a brief moment as if trying to erase the image from his mind. His jaw clenches. The cigarette trembles slightly between his fingers before he regains control. He exhales smoke through his nose slow and deliberate. The room feels heavier now. The smoke drifts across his face softening his features blurring the line between control and revulsion. He opens his eyes again. Composed. Empty. The moment has passed but the stain remains. Camera: Locked-off medium shot; no camera movement; tension carried entirely through performance and atmosphere. Color Palette: Cold greys muted blues desaturated skin tones faint warm tobacco embers. Texture: Wool suit fabric smoke diffusion window glare skin pores quiet dust in the air. Tone: Cold moral detachment fractured by human disgust. Emotion: Power without mercy; control strained by consequence',
    resolution: '1080p',
    aspectRatio: '16:9',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '11',
    src: 'https://assets.movart.ai/gallery/11.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/11.png',
    type: 'video',
    prompt:
      'Low POV. Two race cars ahead on a barren alien surface, offset slightly left and right. Deep tire tracks carve through the terrain, leading the eye forward. Bottom of frame partially blocked by dark vehicle silhouette. ENVIRONMENT Desolate moon-like landscape, dusty granular ground, no vegetation, no structures. Rolling terrain stretches to the horizon. A massive planet or moon hangs low in the sky, partially shadowed, softly glowing. ACTION Cars racing forward at speed, dust trails illuminated by headlights. Ground texture streaks from motion. No explosions, no spectacle — pure mechanical movement. LIGHTING Only practical light from vehicle headlights. Harsh beams cut across the ground, creating long shadows and blown highlights. Sky remains almost pitch black. CAMERA / OPTICS Analog 16mm / degraded 35mm look. Heavy film grain, noise crawling in shadows, slight motion blur. Imperfect focus. No modern sharpness. Slight exposure flicker. COLOR / GRADE Muted toxic palette: dirty greens, pale cyan highlights, sickly moonlight, deep blacks. Looks chemically processed, underexposed, imperfect color correction. STYLE Bootleg sci-fi realism. Feels like forbidden footage from a lost 70s experimental film. Documentary, procedural, cold, lonely. No polish. NEGATIVE / DO NOT No neon, no futuristic UI, no clean CGI, no epic glow, no text, no logos, no people visible, no stylization. OUTPUT Raw analog sci-fi racing footage, grounded, eerie, cinematic realism.',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '12',
    src: 'https://assets.movart.ai/gallery/12.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/12.png',
    type: 'video',
    prompt:
      'Warm interior tungsten at 3200 K soft practical lamps low contrast with cozy falloff and visible texture in shadows. In a modest slightly retro living room a quirky young girl lies flat on a red textured carpet her arm stretched toward the camera. She holds a **magnifying glass** in front of her face which enlarges and gently distorts one eye and cheek. Her expression is curious thoughtful slightly deadpan — playful without performing. The frame is **highly centered and symmetrical** with carefully arranged background details: a small framed landscape painting on the wall a simple shelf muted wallpaper and tidy domestic objects. Everything feels intentionally placed storybook-like and still. From the first frame the **camera begins a slow deliberate dolly-in** moving straight toward her face and the magnifying glass. As the camera advances the distortion grows subtly stronger filling more of the frame while her real face remains calm and steady behind it. The movement is precise mechanical and gentle — never handheld — evoking a curated whimsical tone. The magnifying glass catches warm reflections from the room’s light adding small flares and soft bloom. Her fingers shift slightly on the handle a tiny human imperfection against the rigid symmetry. The world feels quiet intimate and oddly magical as if time has slowed to observe a small meaningful moment',
    resolution: '1080p',
    aspectRatio: '16:9',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '13',
    src: 'https://assets.movart.ai/gallery/13.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/13.png',
    type: 'video',
    prompt:
      'A highly cinematic photorealistic retro Japanese subway interior flying through a peach–pink sunset sky. The lighting is warm directional and atmospheric — with sunlight streaming softly through the windows creating golden rim light long diffused shadows and gentle volumetric haze. All surfaces have a muted matte finish; NO harsh reflections or glossy CGI shine. The pastel mint and blush pink interior is color-graded with soft creamy highlights low contrast shadows warm halation and delicate bloom for a dreamy filmic look. Subtle grain and atmospheric diffusion create the feel of high-end cinema. Outside glowing clouds drift slowly past the windows casting warm painterly reflections inside. Depth is emphasized with a slight haze and soft focus falloff. The camera slowly dolly-forward through the aisle in a perfectly symmetrical 9:16 vertical frame. The entire mood is surreal calm dreamy and unmistakably cinematic — like a pastel arthouse film. Absolutely no hyper-clean digital look no harsh lighting no plastic gloss',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '14',
    src: 'https://assets.movart.ai/gallery/14.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/14.png',
    type: 'video',
    prompt:
      'Ultra-realistic cinematic wide-angle shot inside an empty 1980s corporate office interior. No furniture. No objects. Only plain off-white walls a low ceiling with rectangular fluorescent light panels clearly indoors. The entire floor is covered in real natural grass thick and uneven clearly growing indoors. At the start of the shot a large but not fully inflated inflatable smiley face sits several feet away from the camera. The inflatable is neon yellow glossy rubber-like with visible seams folds and wrinkles. It has simple black oval eyes and a thick curved black smile. Over time the inflatable continuously inflates without stopping. As it inflates it expands toward the camera in addition to pressing into walls ceiling and floor. The grass is flattened beneath it. The inflatable deforms heavily under pressure stretching and bulging. By the end of the shot the inflatable fills the entire room volume AND pushes directly into the camera lens. The smiley face makes physical contact with the lens occupying the entire frame. Perspective distorts as the surface presses forward. The final frame is extreme close-up with the inflatable touching the lens causing slight warping and softness at the edges. Lighting remains cold flat fluorescent with bright specular highlights sliding across the surface during contact. Camera is static wide-angle (18–22mm) and does not move or pull back. The camera cannot escape the inflation. Photorealistic materials global illumination cinematic realism. Overwhelming claustrophobic unavoidable. No people. No logos. No branding. ',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '15',
    src: 'https://assets.movart.ai/gallery/15.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/15.png',
    type: 'video',
    prompt:
      'a cinematic image of a little girl riding a bicycle down a suburban street, wearing colorful clothes,, a green helmet, and bright beaded jewelry, with a cute jack russel sitting in a wicker basket at the front of the bike, golden afternoon sunlight casting warm tones, soft motion blur for speed, suburban houses in the background, nostalgic 1980s family film atmosphere, expressive and playful mood, shallow depth of field, natural soft lighting, photorealistic fine art cinematography, evokes childhood joy and adventure, ultra-detailed, cinematic storytelling composition. Camera Tracking her as she rides',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.5 Turbo',
  },
  {
    id: '16',
    src: 'https://assets.movart.ai/gallery/16.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/16.png',
    type: 'video',
    prompt:
      'A surreal unsettling white plastic horse-like creature with exaggerated sculpted features long rigid snout half-closed drooping eyelids with thick lashes and glossy uncanny-valley toy texture. The scene is dimly lit with a faint spotlight leaving most of the background in darkness. Slow almost imperceptible camera push-in. The horse barely moves except for tiny twitches in the eyes and subtle breathing motions. It leans its head forward unnaturally shadow swallowing half of its face and whispers in a chilling soft British accent: “Reality tastes like sideways rainbows…” The whisper is airy sinister almost too close with subtle reverb. Add slight flicker in the lighting eerie stillness and high-detail horror-surreal rendering',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '17',
    src: 'https://assets.movart.ai/gallery/17.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/17.png',
    type: 'video',
    prompt:
      'Animated scene of a massive futuristic mecha in a dark hangar igniting its blue plasma thrusters steam and sparks swirling as it prepares for launch. Cel-shaded anime aesthetic glowing blue light fills the frame camera slowly tilts upward to reveal its towering frame',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Veo 3.1',
  },
  {
    id: '18',
    src: 'https://assets.movart.ai/gallery/18.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/18.png',
    type: 'video',
    prompt:
      'Ultra-cinematic wide shot (16:9) inside a grand 19th-century ballroom / drawing room. Smooth dolly glide at eye level. The leading woman stands or sits foreground center, dominating the frame, with the ballroom unfolding behind her in elegant symmetry (tall windows, gilded mirrors, chandeliers, velvet drapes, marble columns). The staging is designed so her silhouette is instantly iconic. One striking aristocratic woman, calm and powerful. She has ABSURDLY HUGE, towering puffed pink hair, styled like an extravagant powdered wig but pastel pink — sculpted curls, cloud-like volume, stacked height, delicate pearl pins and ribbon accents. Her hair is dramatically larger than everyone else’s by far, rising above the crowd and reading as a sculptural crown. She is composed and unbothered, eyes steady, slight knowing expression. Behind her, a dense crowd of aristocrats in Victorian formalwear and normal-sized powdered wigs form a whispering wall of gossip: people lean toward each other, hands partially covering mouths fans hide lips while murmuring subtle side glances directed at the heroine small clusters whisper simultaneously, creating a visible ripple of scandal. Their expressions are tense, curious, judgmental, and excited. The whispering is the key background action and should be clearly readable. A charged pause: the heroine slightly turns her head as if she hears the whispering — the room tightens. A couple mid-waltz hesitates. A gentleman freezes with a gloved hand half-offered. The atmosphere is elegant but suffocating with gossip. Candlelit ballroom with warm gold reflections on polished wood floor. Dust motes suspended. Classical paintings, ornate sconces, carved moldings. Subtle haze from candles and perfume creates depth. Golden candlelight and chandelier glow as key, cool moonlight through windows as contrast. The heroine gets a gentle rim light to outline the enormous pink hair and separate her from the whispering crowd. Soft halation on highlights, volumetric rays through haze, dramatic shadow falloff. Shot on ARRI AMIRA, high dynamic range, smooth highlight roll-off. Premium lens character (Cooke / vintage prime vibe): creamy bokeh, gentle chandelier flares, elegant focus falloff. 50mm perspective, shallow depth of field: heroine tack sharp, background crowd softly blurred but expressions and whispering gestures still readable. Subtle film grain, prestige period color grade. Warm gold candlelight + cool blue moonlight + jewel-toned fabrics. The heroine’s massive pink hair is the bold color anchor, balanced by emerald/sapphire/burgundy accents in her gown. The crowd stays muted (cream, gold, dusty blue) to amplify her presence.',
    resolution: '1080p',
    aspectRatio: '16:9',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '19',
    src: 'https://assets.movart.ai/gallery/19.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/19.png',
    type: 'video',
    prompt:
      'A retro-futuristic bubble-cockpit car speeds through a Japanese city street at high velocity. The camera is placed inside the cockpit showing the driver’s gloved hands gripping two joystick-style controls and a full dashboard of analog gauges dials and retro avionics. The wide curved windshield reveals the road rushing forward with soft motion blur on the buildings outside. The lighting is soft and muted with overcast cinematic tones teal-blue highlights gentle warm shadows and a 1970s-futurist color palette. The style should match muted filmic retro-future visuals: clean analog textures smooth rounded geometry pastel materials and subtle film grain. The video should feel cinematic and controlled with natural camera shake and fast movement outside the cockpit. Shot in 1:1 aspect ratio. Avoid cartoon looks avoid oversaturated colors avoid modern digital interfaces avoid clutter avoid excessive bloom or harsh contrast avoid sci-fi spaceships and avoid showing any people except for the gloved hands',
    resolution: '1080p',
    aspectRatio: '1:1',
    model: 'Kling 2.6 Pro',
  },
  {
    id: '20',
    src: 'https://assets.movart.ai/gallery/20.mp4',
    thumbnail: 'https://assets.movart.ai/gallery/20.png',
    type: 'video',
    prompt:
      'ultra-cinematic night portrait of a woman in the center of the frame intense focused expression looking down as she lights a cigarette dramatic close-up composition surrounded by many hands reaching in from all sides holding lit lighters at least seven hands total eight lighters total flames creating warm highlights on her face and shoulders deep blue twilight sky background subtle city lights bokeh far in the distance high contrast lighting moody film still shallow depth of field sharp realistic skin texture glossy reflections on metal lighters hands layered in foreground creating depth 35mm cinematic look rich color grading gritty editorial vibe natural film grain crisp focus dramatic rim light and flame glow realistic smoke haze immersive intimate framing. she putts a n un litted cigareete in her mouth and the hands enter the frame to light the cigarette',
    resolution: '1080p',
    aspectRatio: '9:16',
    model: 'Kling 2.5 Turbo',
  },
];
