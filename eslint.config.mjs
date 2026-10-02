import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // O layout raiz do dashboard do cliente (app/dashboard/layout.tsx →
  // DashboardLayoutWrapper) já monta o DashboardShell pra toda rota
  // /dashboard/** — uma rota/componente aninhado que importa de novo
  // duplica a montagem (sidebar duplicada, e já quebrou de verdade: duas
  // instâncias tentando abrir o mesmo canal Realtime de mensagens não
  // lidas derrubava a tela inteira com "cannot add postgres_changes
  // callbacks after subscribe()" — achado em produção, não pego por tsc
  // nem pela suite de testes, só rodando de verdade no navegador).
  //
  // Sem regra equivalente pro admin: app/admin/** não tem um wrapper
  // central como o DashboardLayoutWrapper — cada página/Client Component
  // do admin monta AdminShell diretamente, de propósito, é o padrão
  // estabelecido lá (confirmado: 33 arquivos legítimos fariam essa regra
  // disparar se ela incluísse AdminShell). Não force uma regra que não
  // reflete a arquitetura real.
  {
    files: ["app/dashboard/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@/components/layout/DashboardShell", message: "O layout raiz (app/dashboard/layout.tsx) já monta o DashboardShell pra toda rota — não remontar numa rota/componente aninhado." },
        ],
      }],
    },
  },
]);

export default eslintConfig;
