import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function getSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://placeholder.supabase.co'
  );
}

function getAdminKey(): string | undefined {
  // Secret keys are the current Supabase credential for privileged access.
  // Keep the legacy key as a transition path for existing projects.
  // Template values (e.g. "sb_secret_...your_project_secret_key") must not win over
  // a real key, otherwise the client silently authenticates with a placeholder.
  const candidates = [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY];
  const isPlaceholder = (value: string) => /your[_-]|your_project|placeholder|changeme|^\.\.\.$/i.test(value);
  return candidates
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value && value.length > 0 && !isPlaceholder(value)));
}

export function isSupabaseAdminConfigured(): boolean {
  const url = getSupabaseUrl();
  const adminKey = getAdminKey();

  return Boolean(
    adminKey &&
    !url.includes('placeholder') &&
    !url.includes('your-project-id')
  );
}

/**
 * Creates an RLS-bypassing client for server-side administrative work only.
 * Never import this module from a Client Component or expose its key via
 * NEXT_PUBLIC_ environment variables.
 */
export function createAdminSupabaseClient() {
  const adminKey = getAdminKey();

  if (!isSupabaseAdminConfigured() || !adminKey) {
    throw new Error(
      'Supabase admin client is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (preferred), or SUPABASE_SERVICE_ROLE_KEY for legacy projects.'
    );
  }

  return createClient(getSupabaseUrl(), adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
