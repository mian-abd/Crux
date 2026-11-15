// Tests for the 3D views' pure modules (the event-to-graph reducer and the
// sequence helpers). The site's own vitest config only covers lib/; run
// these from site/ with:
//   npx vitest run --config components/viz/vitest.config.mts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const site = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: site,
  resolve: { alias: { "@": site } },
  test: {
    environment: "node",
    include: ["components/viz/**/*.test.ts"],
  },
});
