// Type declarations for web-only CSS imports used by the Expo template
// (animated-icon.module.css, global.css). Metro handles these at build time.
declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}

declare module '*.css';
