/** Official BaMo identity with warm surfaces and headset teal. */
export const BrandColors = {
  ink: '#17243B', inkSoft: '#30415D',
  navy: '#1F3C88', navyLight: '#2E4EA1', navyDark: '#162D6B', navyDeep: '#10224E',
  orange: '#E67E22', orangeLight: '#F39C4E', orangeSoft: '#FDEADB', orangeDark: '#A64B0A',
  // Compatibility aliases for screens introduced with the earlier palette.
  coral: '#E67E22', coralHover: '#F39C4E', coralSoft: '#FDEADB', coralDark: '#A64B0A',
  teal: '#147D83', tealSoft: '#E6F4F2',
  error: '#C83232', errorSoft: '#FFF0EF', errorDeep: '#A92323',
  success: '#21804B', successDeep: '#19643B', successSoft: '#EAF6EF',
  warnSoft: '#FFF2D5', warnDeep: '#8A560A', infoSoft: '#EDF1FA', infoDeep: '#1F3C88',
  textBody: '#17243B', textHeading: '#17243B', textMuted: '#647084', textSecondary: '#526075',
  screenBg: '#FFF7ED', card: '#FFFFFF', border: '#E5DFD7', borderLight: '#F0EBE4',
  borderDark: '#A6ADBA', disabled: '#7B8493', white: '#FFFFFF',
  cream50: '#FFFDF8', cream100: '#FFF7ED', cream200: '#FDF2E6',
  cream300: '#F8EBD6', cream400: '#EBE1CF', cream500: '#E6D6BE',
} as const;

export const BrandFonts = {
  heading: 'Poppins_600SemiBold', display: 'Poppins_700Bold',
  // Compatibility name: earlier headings now also use Poppins.
  serif: 'Poppins_600SemiBold',
  regular: 'Inter_400Regular', medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold', bold: 'Inter_700Bold', interRegular: 'Inter_400Regular',
} as const;

export const TypeScale = {
  displayL: { fontFamily: BrandFonts.display, fontSize: 38, lineHeight: 48, letterSpacing: -1 },
  displayM: { fontFamily: BrandFonts.display, fontSize: 34, lineHeight: 44, letterSpacing: -0.8 },
  displayS: { fontFamily: BrandFonts.display, fontSize: 30, lineHeight: 40, letterSpacing: -0.6 },
  displayXS: { fontFamily: BrandFonts.heading, fontSize: 28, lineHeight: 38, letterSpacing: -0.5 },
  h1: { fontFamily: BrandFonts.heading, fontSize: 26, lineHeight: 36, letterSpacing: -0.5 },
  h2: { fontFamily: BrandFonts.heading, fontSize: 23, lineHeight: 32, letterSpacing: -0.4 },
  h3: { fontFamily: BrandFonts.heading, fontSize: 19, lineHeight: 28, letterSpacing: -0.2 },
  h4: { fontFamily: BrandFonts.semiBold, fontSize: 16, lineHeight: 24 },
  bodyLarge: { fontFamily: BrandFonts.regular, fontSize: 17, lineHeight: 27 },
  body: { fontFamily: BrandFonts.regular, fontSize: 16, lineHeight: 24 },
  bodyBold: { fontFamily: BrandFonts.semiBold, fontSize: 15, lineHeight: 23 },
  bodySmall: { fontFamily: BrandFonts.regular, fontSize: 13, lineHeight: 20 },
  label: { fontFamily: BrandFonts.semiBold, fontSize: 14, lineHeight: 20 },
  labelSmall: { fontFamily: BrandFonts.medium, fontSize: 12, lineHeight: 18 },
  button: { fontFamily: BrandFonts.semiBold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: BrandFonts.regular, fontSize: 13, lineHeight: 20 },
  helper: { fontFamily: BrandFonts.regular, fontSize: 13, lineHeight: 20 },
  input: { fontFamily: BrandFonts.regular, fontSize: 16, lineHeight: 24 },
  formError: { fontFamily: BrandFonts.medium, fontSize: 13, lineHeight: 20 },
} as const;

export const Radii = { card: 20, cardLarge: 26, button: 14, chip: 12, pill: 999 } as const;
export const CardShadow = {
  shadowColor: '#10224E', shadowOpacity: 0.04, shadowRadius: 12,
  shadowOffset: { width: 0, height: 3 }, elevation: 1,
} as const;
