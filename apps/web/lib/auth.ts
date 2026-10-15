// HTTP Basic credentials ("email:password", base64) kept in a cookie so that
// both the browser (API calls) and Next middleware (route protection) can see it.
export const AUTH_COOKIE = 'nl_auth';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function encodeCredentials(email: string, password: string): string {
  const bytes = new TextEncoder().encode(`${email.trim().toLowerCase()}:${password}`);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${AUTH_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(AUTH_COOKIE.length + 1)) : null;
}

export function setAuthToken(token: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Strict${secure}`;
}

export function clearAuthToken() {
  document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
}
