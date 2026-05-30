// Vercel serverless function: mints a short-lived LiveKit access token for the
// browser. Tokens are never minted client-side. Served at /api/token (and at
// /token via the rewrite in vercel.json).
//
// Required Vercel env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req: any, res: any) {
  const room = (req.query?.room as string) || 'loan-demo'
  const identity =
    (req.query?.identity as string) || `user-${Math.random().toString(36).slice(2, 8)}`

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const wsUrl = process.env.LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) {
    res.status(500).json({ error: 'LiveKit env vars not configured' })
    return
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, name: identity })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })
  const token = await at.toJwt()

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json({ token, url: wsUrl, room, identity })
}
