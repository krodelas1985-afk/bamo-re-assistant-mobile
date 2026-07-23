/**
 * BaMo brand tokens — single source of truth for the mobile app.
 * Warm-cream system per the approved "BayMo — App Screens" redesign
 * (claude.ai/design BayMo-Mobile App New Design, 2026-07-23):
 * cream surfaces, ink text, coral accent, Instrument Serif headings.
 *
 * Legacy token names (navy/orange/cream*) are kept as aliases so existing
 * screens restyle without churn; prefer the new names (ink/coral/…) in new code.
 */

export const BrandColors = {
  // Ink — primary dark (replaces navy)
  ink: '#0F172A',
  inkSoft: '#1E293B',

  // Coral — accent (replaces orange)
  coral: '#E85D3A',
  coralHover: '#F0873A',
  coralSoft: '#FEF0EC', // tinted bubbles / highlight cards
  coralDark: '#C74A2C',

  // Semantic
  error: '#DC2626',
  errorSoft: '#FFF1F2',
  errorDeep: '#BE123C',
  success: '#22C55E',
  successDeep: '#2D6A4F',
  successSoft: '#EAF6EF',
  warnSoft: '#FEF3C7',
  warnDeep: '#B45309',
  infoSoft: '#EEF2FF',
  infoDeep: '#4F46E5',

  // Text
  textBody: '#0F172A',
  textHeading: '#0F172A',
  textMuted: '#94A3B8',
  textSecondary: '#64748B',

  // Surfaces
  screenBg: '#FAF8F5', // warm cream app background
  card: '#FFFFFF',
  border: '#E8E2D6', // warm cream border
  borderLight: '#EFEAE0',
  borderDark: '#D8D2C4',
  disabled: '#A8A8A8',
  white: '#FFFFFF',

  // ---- Legacy aliases (old brand names → new values) ----
  navy: '#0F172A',
  navyLight: '#1E293B',
  navyDark: '#0B1120',
  navyDeep: '#0F172A', // dark hero/dashboard cards
  orange: '#E85D3A',
  orangeLight: '#F0873A',
  orangeSoft: '#FEF0EC',
  orangeDark: '#C74A2C',
  cream50: '#FDFCFA',
  cream100: '#FAF8F5',
  cream200: '#F5F1EA',
  cream300: '#EFE9DE',
  cream400: '#E8E2D6',
  cream500: '#D8D2C4',
} as const;

/**
 * Instrument Serif for headings/display; Inter for everything else.
 * Loaded in src/app/_layout.tsx.
 */
export const BrandFonts = {
  serif: 'InstrumentSerif_400Regular',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  interRegular: 'Inter_400Regular',
} as const;

/** Type scale per the warm-cream redesign: serif display/headings, Inter body */
export const TypeScale = {
  displayL: { fontFamily: BrandFonts.serif, fontSize: 44, lineHeight: 50, letterSpacing: -0.8 },
  displayM: { fontFamily: BrandFonts.serif, fontSize: 38, lineHeight: 44, letterSpacing: -0.7 },
  displayS: { fontFamily: BrandFonts.serif, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  displayXS: { fontFamily: BrandFonts.serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  h1: { fontFamily: BrandFonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  h2: { fontFamily: BrandFonts.serif, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  h3: { fontFamily: BrandFonts.serif, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  h4: { fontFamily: BrandFonts.semiBold, fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontFamily: BrandFonts.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: BrandFonts.regular, fontSize: 14, lineHeight: 21 },
  bodyBold: { fontFamily: BrandFonts.semiBold, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: BrandFonts.regular, fontSize: 12.5, lineHeight: 18 },
  label: { fontFamily: BrandFonts.semiBold, fontSize: 13, lineHeight: 16 },
  labelSmall: { fontFamily: BrandFonts.semiBold, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  button: { fontFamily: BrandFonts.semiBold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: BrandFonts.regular, fontSize: 12.5, lineHeight: 16 },
  helper: { fontFamily: BrandFonts.regular, fontSize: 12, lineHeight: 16 },
  input: { fontFamily: BrandFonts.regular, fontSize: 15, lineHeight: 22 },
  formError: { fontFamily: BrandFonts.regular, fontSize: 12, lineHeight: 16 },
} as const;

export const Radii = {
  card: 18,
  cardLarge: 22,
  button: 18,
  chip: 14,
  pill: 999,
} as const;

/** Soft card shadow used across the warm-cream system */
export const CardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
