import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getProfileRole } from '@/lib/services/role'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next({ request })

  // Cria client Supabase no middleware (lê/escreve cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
      // Mesmas opções explícitas de lib/supabase-server.ts / lib/supabase.ts.
      cookieOptions: {
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  /* ── Rotas do cliente (/dashboard/*) ─────────────────────────── */
  if (pathname.startsWith('/dashboard')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const role = await getProfileRole(supabase, user.id)

    // Técnico tentou acessar área do cliente → vai para /admin
    if (role === 'technician') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return response
  }

  /* ── Rotas do técnico (/admin/*) ─────────────────────────────── */
  if (pathname.startsWith('/admin') &&
      !pathname.startsWith('/admin/login')) {

    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))

    const role = await getProfileRole(supabase, user.id)

    // Cliente tentou acessar área do técnico → vai para /dashboard
    if (role !== 'technician') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  /* ── Login do cliente: redireciona se já autenticado ─────────── */
  if (pathname === '/login' || pathname === '/cadastro') {
    if (user) {
      const role = await getProfileRole(supabase, user.id)
      const dest = role === 'technician' ? '/admin' : '/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return response
  }

  /* ── Login do técnico: redireciona se já autenticado ─────────── */
  if (pathname === '/admin/login') {
    if (user) {
      const role = await getProfileRole(supabase, user.id)
      if (role === 'technician') {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/cadastro',
  ],
}
