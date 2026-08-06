import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Vite only exposes `VITE_`-prefixed values, and only on `import.meta.env`.
  // The server reads plain `process.env`, so `.env` is loaded into it here —
  // otherwise `npm run dev` starts with no secrets and fails its own config
  // check. Nothing is exposed to the client by doing this.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
