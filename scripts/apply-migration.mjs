/**
 * Script para aplicar migrations ao Supabase via SQL
 *
 * Uso: node --env-file=.env.local scripts/apply-migration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function applyMigration() {
  try {
    const migrationFile = path.join(
      process.cwd(),
      'supabase/migrations/20260920225514_marketplace_apps_promotions.sql'
    )

    if (!fs.existsSync(migrationFile)) {
      console.error(`Migration file not found: ${migrationFile}`)
      process.exit(1)
    }

    const sql = fs.readFileSync(migrationFile, 'utf-8')

    console.log('Applying migration...')
    const { error } = await supabase.rpc('exec', { sql })

    if (error) {
      console.error('Error applying migration:', error.message)
      // Try direct SQL execution
      console.log('Trying alternative approach...')
      // Note: direct SQL execution via Supabase client is limited
      // The migration should be applied manually via Supabase dashboard
      console.log('\n⚠️  Please apply the migration manually:')
      console.log('1. Go to https://app.supabase.com/')
      console.log('2. Select your project')
      console.log('3. Go to SQL Editor')
      console.log('4. Copy and paste the SQL from supabase/migrations/20260920225514_marketplace_apps_promotions.sql')
      console.log('5. Execute')
      process.exit(1)
    }

    console.log('✅ Migration applied successfully!')
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

applyMigration()
