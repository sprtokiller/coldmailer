const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ')

export function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  id_token: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetchToken<TokenResponse>({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  return res
}

async function fetchToken<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams(params),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error(`Google token request failed: ${res.status}`)
  return await res.json() as T
}

interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  picture: string
}

export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  return $fetch<GoogleUserInfo>('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  return fetchToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
}

export interface GmailMessageHeader {
  name: string
  value: string
}

export interface GmailMessagePart {
  partId?: string
  mimeType: string
  filename?: string
  headers?: GmailMessageHeader[]
  body: { size: number; data?: string; attachmentId?: string }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  payload: GmailMessagePart
  internalDate: string
}

export async function listGmailMessages(
  accessToken: string,
  query: string,
  pageToken?: string,
): Promise<{ messages?: { id: string }[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ q: query, maxResults: '100' })
  if (pageToken) params.set('pageToken', pageToken)

  return $fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
  format: 'full' | 'metadata' = 'full',
): Promise<GmailMessage> {
  return $fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

function encodeRfc2047(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`
}

export async function createGmailDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ id: string; threadId: string }> {
  const raw = Buffer.from(
    [
      `To: ${to}`,
      `Subject: ${encodeRfc2047(subject)}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      body,
    ].join('\r\n'),
  ).toString('base64url')

  const res = await $fetch<{ id: string; message: { id: string; threadId: string } }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { message: { raw } },
    },
  )
  return res.message
}

export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ id: string; threadId: string }> {
  const raw = Buffer.from(
    [
      `To: ${to}`,
      `Subject: ${encodeRfc2047(subject)}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      body,
    ].join('\r\n'),
  ).toString('base64url')

  const res = await $fetch<{ id: string; threadId: string }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { raw },
    },
  )
  return res
}

