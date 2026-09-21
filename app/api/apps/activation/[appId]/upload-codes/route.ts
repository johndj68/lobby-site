import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import crypto from 'crypto'

const MAX_CODES = 100000
const MAX_CODE_LENGTH = 1000
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const planId = formData.get('planId') as string

  if (!file || !planId) {
    return NextResponse.json({ error: 'Missing file or planId' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 })
  }

  // Verify plan belongs to app
  const { data: plan } = await supabase
    .from('app_plans')
    .select('id')
    .eq('id', planId)
    .eq('app_draft_id', appId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 404 })

  try {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())

    if (lines.length > MAX_CODES) {
      return NextResponse.json(
        { error: `Too many codes (max ${MAX_CODES})` },
        { status: 400 }
      )
    }

    const codes: string[] = []
    const duplicates: string[] = []
    const invalid: { line: number; reason: string }[] = []
    const hashes = new Set<string>()

    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].trim()

      if (!code) {
        invalid.push({ line: i + 1, reason: 'Empty line' })
        continue
      }

      if (code.length > MAX_CODE_LENGTH) {
        invalid.push({ line: i + 1, reason: `Code too long (max ${MAX_CODE_LENGTH})` })
        continue
      }

      const hash = hashCode(code)
      if (hashes.has(hash)) {
        duplicates.push(code)
      } else {
        hashes.add(hash)
        codes.push(code)
      }
    }

    // Check existing codes
    const { data: existing } = await supabase
      .from('app_activation_codes')
      .select('code_hash')
      .eq('app_draft_id', appId)
      .in('code_hash', Array.from(hashes))

    const existingHashes = new Set((existing || []).map(e => e.code_hash))
    const alreadyExisting = codes.filter(c => existingHashes.has(hashCode(c)))

    return NextResponse.json({
      summary: {
        total_lines: lines.length,
        valid_codes: codes.length - alreadyExisting.length,
        duplicates: duplicates.length,
        already_existing: alreadyExisting.length,
        invalid_lines: invalid.length,
      },
      details: {
        duplicates: duplicates.slice(0, 100), // Mask details
        invalid: invalid.slice(0, 100),
        already_existing: alreadyExisting.length > 0,
      },
      codes: codes.filter(c => !alreadyExisting.includes(c)), // Only new codes
      planId,
    })
  } catch (err) {
    console.error('[upload-codes]', err)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}
