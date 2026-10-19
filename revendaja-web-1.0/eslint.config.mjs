import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler ainda não está habilitado neste projeto (create-next-app --no-react-compiler).
      // Essas duas regras vêm por padrão do eslint-config-next 16 mas endereçam padrões legítimos e
      // comuns aqui (boot de sessão no mount, contador de cooldown) — desligadas até adotarmos o
      // Compiler de fato, quando reavaliamos.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
