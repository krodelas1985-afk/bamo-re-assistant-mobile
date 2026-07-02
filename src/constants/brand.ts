/**
 * BaMo brand tokens — single source of truth for the mobile app.
 * Mirrors .claude/skills/bamo-design/SKILL.md (the official brand standard).
 */

export const BrandColors = {
  // Primary — Navy
  navy: '#1F3C88',
  navyLight: '#2E4EA1',
  navyDark: '#162D6B',
  navyDeep: '#132A5C', // dark hero/dashboard cards

  // Accent — Orange
  orange: '#E67E22',
  orangeLight: '#F39C4E',
  orangeSoft: '#F3C098',
  orangeDark: '#BF6516',

  // Semantic
  error: '#E74C3C',
  success: '#2ECC71',

  // Text
  textBody: '#5B5B5B',
  textHeading: '#3A3A3A',
  textMuted: '#9CA3AF',
  textSecondary: '#4B5563',

  // Warm surfaces (cream)
  cream50: '#FFFDF8',
  cream100: '#FFF7ED',
  cream200: '#FDF2E6',
  cream300: '#F8EBD6',
  cream400: '#EBE1CF',
  cream500: '#E6D6BE',

  // Neutrals & borders
  border: '#E5E7EB',
  borderLight: '#E2E2E2',
  borderDark: '#D1D5DB',
  disabled: '#A8A8A8',

  white: '#FFFFFF',
  screenBg: '#F6F7FA', // light gray app background behind cards (per mockup)
} as const;

/** Poppins primary; Inter for small body/helper text. Loaded in src/app/_layout.tsx */
export const BrandFonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  interRegular: 'Inter_400Regular',
} as const;

/** Type scale: fontSize / lineHeight per the brand standard */
export const TypeScale = {
  displayL: { fontFamily: BrandFonts.bold, fontSize: 48, lineHeight: 56 },
  displayM: { fontFamily: BrandFonts.bold, fontSize: 40, lineHeight: 48 },
  displayS: { fontFamily: BrandFonts.bold, fontSize: 36, lineHeight: 40 },
  displayXS: { fontFamily: BrandFonts.semiBold, fontSize: 30, lineHeight: 36 },
  h1: { fontFamily: BrandFonts.bold, fontSize: 32, lineHeight: 40 },
  h2: { fontFamily: BrandFonts.semiBold, fontSize: 24, lineHeight: 32 },
  h3: { fontFamily: BrandFonts.semiBold, fontSize: 18, lineHeight: 24 },
  h4: { fontFamily: BrandFonts.semiBold, fontSize: 16, lineHeight: 22 },
  bodyLarge: { fontFamily: BrandFonts.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: BrandFonts.regular, fontSize: 14, lineHeight: 20 },
  bodyBold: { fontFamily: BrandFonts.semiBold, fontSize: 14 },
  bodySmall: { fontFamily: BrandFonts.interRegular, fontSize: 12, lineHeight: 18 },
  label: { fontFamily: BrandFonts.medium, fontSize: 13, lineHeight: 16 },
  labelSmall: { fontFamily: BrandFonts.medium, fontSize: 11, lineHeight: 14 },
  button: { fontFamily: BrandFonts.semiBold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: BrandFonts.regular, fontSize: 13, lineHeight: 14 },
  helper: { fontFamily: BrandFonts.interRegular, fontSize: 12, lineHeight: 16 },
  input: { fontFamily: BrandFonts.regular, fontSize: 16, lineHeight: 24 },
  formError: { fontFamily: BrandFonts.regular, fontSize: 12, lineHeight: 16 },
} as const;

export const Radii = {
  card: 16,
  cardLarge: 20,
  button: 12,
  pill: 999,
} as const;
