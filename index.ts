import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://127.0.0.1:3000/oauth/callback"
);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose"
];

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMime(to: string, subject: string, body: string) {
  return [
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\r\n");
}

async function createDraft(to: string, subject: string, body: string) {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const mime = buildMime(to, subject, body);
  const raw = toBase64Url(mime);

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });

  return res.data;
}