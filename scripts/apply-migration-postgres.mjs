/**
 * Aplica migration via conexão PostgreSQL direta
 *
 * Uso: node --env-file=.env.local scripts/apply-migration-postgres.mjs
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Variáveis SUPABASE não configuradas em .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function applyMigration() {
  try {
    console.log('📋 Lendo migration...')
    const sql = fs.readFileSync(
      './supabase/migrations/20260920225514_marketplace_apps_promotions.sql',
      'utf-8'
    )

    console.log('🔗 Conectando ao Supabase...')

    // Tenta executar via Supabase SDK
    // Nota: Isso pode falhar se RPC não está habilitado
    console.log('⚠️  Tentando via RPC (pode falhar se não habilitado)...\n')

    const { error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    }).catch(() => ({ error: { message: 'RPC não disponível' } }))

    if (error) {
      console.log('❌ RPC falhou:', error.message)
      console.log('\n💡 SOLUÇÃO: Aplicar manualmente via Supabase Dashboard\n')
      console.log('PASSO A PASSO:')
      console.log('1. Acesse https://app.supabase.com/')
      console.log('2. Selecione seu projeto')
      console.log('3. Vá para SQL Editor')
      console.log('4. Cole o SQL abaixo:\n')
      console.log('━'.repeat(70))
      console.log(sql)
      console.log('━'.repeat(70))
      console.log('\n5. Clique em "Execute"\n')
      console.log('Após aplicar a migration, rode:')
      console.log('  node --env-file=.env.local scripts/seed-marketplace-data.mjs\n')
      return
    }

    console.log('✅ Migration aplicada com sucesso!')
  } catch (err) {
    console.error('❌ Erro:', err.message)
    console.log('\n💡 Se falhar, aplicar manualmente conforme instruções acima.')
  }
}

applyMigration()
