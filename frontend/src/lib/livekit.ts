// Token endpoint. In dev this is the local Python token server (CORS-enabled);
// in a production build it defaults to same-origin (the Vercel /token function).
// Override anytime with VITE_TOKEN_URL.
const TOKEN_BASE =
  import.meta.env.VITE_TOKEN_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')

export interface TokenResponse {
  token: string
  url: string
  room: string
  identity: string
}

export async function fetchToken(room: string, identity: string): Promise<TokenResponse> {
  const res = await fetch(
    `${TOKEN_BASE}/token?room=${encodeURIComponent(room)}&identity=${encodeURIComponent(identity)}`,
  )
  if (!res.ok) throw new Error(`Token request failed (${res.status})`)
  return res.json()
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
