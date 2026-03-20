/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVE_WORLD_PACKAGE_ID?: string;
  readonly VITE_BARTER_BOX_PACKAGE_ID?: string;
  readonly VITE_BARTER_BOX_EXTENSION_CONFIG_ID?: string;
  readonly VITE_SUI_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
