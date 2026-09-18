// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["supabase/functions/**/*.ts"],
    // Deno resolves HTTPS and JSR imports outside Node's module resolver.
    rules: { "import/no-unresolved": "off" },
  }
]);
