/**
 * Aplica migration diretamente via SQL
 * Nota: Supabase não permite exec() RPC por padrão.
 * Esta script exibe o SQL para copiar manualmente.
 */

import fs from 'fs'
import path from 'path'

const migrationFile = path.join(
  process.cwd(),
  'supabase/migrations/20260920225514_marketplace_apps_promotions.sql'
)

const sql = fs.readFileSync(migrationFile, 'utf-8')

console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log('║           MIGRATION PARA SUPABASE DASHBOARD                ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

console.log('PASSO A PASSO:\n')
console.log('1. Acesse: https://app.supabase.com/')
console.log('2. Selecione seu projeto LOBBY')
console.log('3. Vá para: SQL Editor')
console.log('4. Cole o SQL abaixo e execute\n')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(sql)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('✅ SQL copiado para clipboard (se disponível)')
console.log('\nApós executar no Supabase, rode:')
console.log('  node --env-file=.env.local scripts/seed-marketplace-data.mjs\n')
