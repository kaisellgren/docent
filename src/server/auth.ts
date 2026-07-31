import { Google, generateCodeVerifier, generateState } from 'arctic';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { db, sql } from './db';
import { editorEmails, env } from './env';

const SESSION_COOKIE = 'docent_session';
const OAUTH_STATE_COOKIE = 'docent_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'docent_oauth_verifier';
const encoder = new TextEncoder();

type Session = { userId: string; email: string; name: string; avatarUrl?: string | null; isEditor: boolean };
type GoogleProfile = { sub: string; email: string; name?: string; picture?: string };

export function googleSignInConfigurationProblem(): string | undefined {
  try {
    env();
    return undefined;
  } catch {
    const required = ['DATABASE_URL', 'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    const missing = required.filter((name) => !process.env[name]?.trim());
    return missing.length
      ? `Google sign-in is not configured. Set ${missing.join(', ')} in .env and restart Vite.`
      : 'Google sign-in configuration is invalid. Check the values in .env and restart Vite.';
  }
}

function google(): Google {
  const configuration = env();
  return new Google(configuration.GOOGLE_CLIENT_ID, configuration.GOOGLE_CLIENT_SECRET, `${configuration.APP_URL}/auth/google/callback`);
}

function secureCookieOptions(maxAge = 60 * 60 * 24 * 14) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: env().APP_URL.startsWith('https://'), path: '/', maxAge };
}

async function signSession(session: Session): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(encoder.encode(env().SESSION_SECRET));
}

export async function currentSession(): Promise<Session | undefined> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env().SESSION_SECRET));
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string' || typeof payload.name !== 'string') return undefined;
    return { userId: payload.userId, email: payload.email, name: payload.name, avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : null, isEditor: editorEmails().has(payload.email.toLowerCase()) };
  } catch {
    return undefined;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) throw new Response('Authentication required', { status: 401 });
  return session;
}

export async function requireEditor(): Promise<Session> {
  const session = await requireSession();
  if (!session.isEditor) throw new Response('Editor permission required', { status: 403 });
  return session;
}

export function beginGoogleSignIn(): string {
  const state = generateState();
  const verifier = generateCodeVerifier();
  setCookie(OAUTH_STATE_COOKIE, state, secureCookieOptions(10 * 60));
  setCookie(OAUTH_VERIFIER_COOKIE, verifier, secureCookieOptions(10 * 60));
  return google().createAuthorizationURL(state, verifier, ['openid', 'profile', 'email']).toString();
}

export async function completeGoogleSignIn(code: string, state: string): Promise<void> {
  const expectedState = getCookie(OAUTH_STATE_COOKIE);
  const verifier = getCookie(OAUTH_VERIFIER_COOKIE);
  if (!expectedState || !verifier || state !== expectedState) throw new Response('Invalid OAuth state', { status: 400 });
  const tokens = await google().validateAuthorizationCode(code, verifier);
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.accessToken()}` } });
  if (!profileResponse.ok) throw new Response('Google profile lookup failed', { status: 401 });
  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.sub || !profile.email) throw new Response('Google account has no verified identity', { status: 401 });

  const user = await (await db()).one(sql.unsafe`
    INSERT INTO app_user (google_subject, email, display_name, avatar_url)
    VALUES (${profile.sub}, ${profile.email.toLowerCase()}, ${profile.name ?? profile.email}, ${profile.picture ?? null})
    ON CONFLICT (google_subject) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      last_seen_at = now()
    RETURNING id
  `) as { id: string };
  const session: Session = { userId: user.id, email: profile.email.toLowerCase(), name: profile.name ?? profile.email, avatarUrl: profile.picture ?? null, isEditor: editorEmails().has(profile.email.toLowerCase()) };
  setCookie(SESSION_COOKIE, await signSession(session), secureCookieOptions());
  setCookie(OAUTH_STATE_COOKIE, '', secureCookieOptions(0));
  setCookie(OAUTH_VERIFIER_COOKIE, '', secureCookieOptions(0));
}

export function clearSession(): void {
  setCookie(SESSION_COOKIE, '', secureCookieOptions(0));
}
