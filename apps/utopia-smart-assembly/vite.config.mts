import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const DEFAULT_UTOPIA_WORLD_PACKAGE_ID =
  "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_EVE_WORLD_PACKAGE_ID": JSON.stringify(
      process.env.VITE_EVE_WORLD_PACKAGE_ID ?? DEFAULT_UTOPIA_WORLD_PACKAGE_ID,
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 4179,
  },
});
