export interface ClientProfile {
  id: string;
  name: string;
  industry: string;
  description: string;
  targetAudience: string;
  location: string;
  brandVoice: string;
  brandValues: string[];
  brandLanguage: string;
  currentGoals: string[];
  notes: string;
}

export const clients: ClientProfile[] = [
  {
    id: "killa",
    name: "Killa",
    industry: "Fine Dining — Nikkei (Peruvian-Japanese Fusion)",
    description:
      "Killa is a high-end fine dining restaurant offering Nikkei cuisine — the fusion of Peruvian culinary richness with Japanese precision and elegance. More than a restaurant, Killa presents itself as a ritual: a limited, intimate, and transcendent experience where every visit feels unique. The name 'Killa' honors Andean roots. The concept is described as 'Fusion Born Under the Moon.'",
    targetAudience:
      "Sophisticated diners, food connoisseurs, date-night couples, corporate professionals, occasion celebrators (birthdays, anniversaries), private event organizers, cultural experience seekers aged 25-55.",
    location: "Utah, USA (with Peruvian & Japanese cultural identity)",
    brandVoice:
      "Poetic, sophisticated, exclusive, and sensory. Language should evoke ritual, cultural fusion, elegance, and emotional depth. Never casual or generic. Every word should feel intentional.",
    brandValues: [
      "Authentic — honors Andean roots elevated through Japanese technique",
      "Sophisticated — fine dining as cultural expression, not merely gastronomic",
      "Harmonious — the union of Peru and Japan flows with balance and serenity",
      "Passionate — respect for origin, emotional depth, desire to surprise",
      "Exclusive — intimate, transcendent, every visit feels unique",
      "Respectful & Sustainable — Japanese discipline applied to a forward-looking business",
      "Sensory — aromas, textures, sounds, and lighting create an emotional journey",
    ],
    brandLanguage: `
KEY BRAND PHRASES (use or adapt these in ad copy):
- "Fusion Born Under the Moon"
- "Made Under Killa's Light"
- "Flavor. Ritual."
- "A Culinary Masterpiece"
- "Andean Soul, Refined"
- "A thoughtful indulgence under candlelight"
- "Fine dining restaurant"
- "Peruvian & Japanese" (the official descriptor)
- "A dark ruby jewel, dangerously captivating" (cocktail language example)
- "A botanical revelation in every sip" (cocktail language example)
- "A ritual. A limited, intimate, and transcendent experience."
- Language around: ritual, moon, fusion, Andean, Japanese precision, harmony, sensory

TONE EXAMPLES FROM BRAND GUIDE:
- Dishes: "This is our signature Corvina (Sea Bass) Ceviche, impeccably cured in potent Leche de Tigre... A dynamic and refreshing coastal classic."
- Cocktails: "A thoughtful indulgence under candlelight." / "A botanical revelation in every sip."
- Atmosphere: "Where every visit feels unique."

VISUAL/DAY-NIGHT SPLIT (inform messaging strategy):
- Daytime (lunch): Floral White palette — lighter, inviting, warm
- Nighttime (dinner/events): Japanese Black palette — mysterious, exclusive, sophisticated

COLORS: International Orange, Japanese Black, Floral White, Dark Vanilla, Zinnwaldite Brown`,
    currentGoals: [],
    notes:
      "Brand guidelines created Dec 2025 by Craneo Estudio. Killa is positioned as a premium, exclusive experience. Ad copy must never feel generic — every headline and description should reflect the brand's poetic, ritual-oriented voice. For Google Ads, lean into the fusion angle, the exclusivity, and the sensory experience.",
  },
  {
    id: "burger-lab",
    name: "Burger Lab",
    industry: "Fast Casual / Themed Restaurant & Bar",
    description:
      "Burger Lab (written as BURGER.LAB) is a themed gourmet burger restaurant and bar with a creative mixology program. The concept is built around the scientific and aesthetic universe of Breaking Bad and Rick & Morty — laboratory glassware for cocktails, dry ice effects, vibrant colors, and an immersive themed atmosphere. The dot in BURGER.LAB is intentional: it reads as a formula, a compound, an experiment — 'BURGER' is the product, 'LAB' is the conceptual platform.",
    targetAudience:
      "Food and pop-culture enthusiasts aged 18-40, foodies seeking Instagrammable experiences, groups celebrating occasions, mixology fans, burger lovers, social media-savvy diners, young professionals and students.",
    location: "Pakistan",
    brandVoice:
      "Bold, playful, experimental, and modern. Funny but not slapstick. Social and community-oriented. The brand essence is 'Have fun experimenting.' Tone can be witty, clever, and confident — never stiff or corporate.",
    brandValues: [
      "Innovative — experimental, creative approach to burgers and cocktails",
      "Modern — contemporary language aligned with global gastronomy and art trends",
      "Creative — freedom to play with flavors, colors, formats, and emotions",
      "Themed — Breaking Bad / Rick & Morty aesthetic: lab glassware, dry ice, vibrant colors",
      "Minimalist — clean, precise, sophisticated visual design",
      "Social — Instagrammable, events, collaborations, community-driven",
      "Funny — playful experimental spirit",
      "Experimental — 'Have fun experimenting' is the brand's core essence",
    ],
    brandLanguage: `
KEY BRAND PHRASES & POSITIONING (use or adapt in ad copy):
- "BURGER.LAB" — always written with the dot when using the full brand name
- "Have fun experimenting" — the brand essence / tagline
- "Burger.Lab was created with the purpose of offering a completely different gastronomic and entertainment experience"
- "Gourmet burgers, creative mixology, and an immersive environment"
- "Where gastronomy + science + exploration meet"
- "A creative culinary laboratory"
- "Unique flavors, immersive environment, and exceptional service"
- "Urban, modern space full of identity"
- Language around: experimentation, lab, formula, discovery, unique flavors, creative

TONE EXAMPLES FROM BRAND GUIDE:
- The dot between BURGER and LAB "reinforces the idea that Burger Lab doesn't just cook — it experiments"
- "Instagrammable" gastronomic and mixology proposal
- Playful, experimental, social spirit
- Modern and relaxed atmosphere

VISUAL/DAY-NIGHT SPLIT (inform messaging strategy):
- Daytime: White palette — clean, energetic, approachable
- Nighttime: Black palette — bold, dramatic, nightlife-ready

COLORS: Maastricht Blue (#0A1A2D), Brandeis Blue (#0B75FF), Mint Green (#87FFA3), White, Black
VISUAL MOTIF: Circles (scientific shape — petri dishes, lab equipment)`,
    currentGoals: [],
    notes:
      "Brand guidelines created Dec 2025 by Craneo Estudio. BURGER.LAB is an Instagrammable, themed experience first — the food and drinks are excellent but the brand is built around the Breaking Bad/Rick & Morty science lab concept. Google Ads copy should be bold, punchy, and reflect the experimental personality. The dot in BURGER.LAB should be preserved in branded mentions where possible.",
  },
];

export function getClientById(id: string): ClientProfile | undefined {
  return clients.find((c) => c.id === id);
}
