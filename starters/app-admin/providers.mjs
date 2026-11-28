import { OAuth2Client } from "google-auth-library";

export function googleProvider(config) {
  if (!config.googleClientId) return null;
  const redirectUri = `${config.origin}/auth/google/callback`;
  const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, redirectUri);
  return {
    start({ state, nonce, challenge }) {
      return client.generateAuthUrl({
        scope: ["openid", "email"],
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
    },
    async verify({ code, verifier, nonce }) {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier });
      if (!tokens.id_token) return null;
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.googleClientId });
      const payload = ticket.getPayload();
      if (payload?.email_verified !== true || !payload.sub || payload.nonce !== nonce) return null;
      return { email: payload.email, subject: payload.sub };
    },
  };
}

export function mailProvider(config) {
  if (!config.mailKey || !config.mailFrom) return null;
  return async ({ email, link }) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.mailKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [email],
        subject: `Confirm your email for ${config.appName}`,
        text: `Open this link in the browser where you requested it:\n${link}\n\nIt expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email provider rejected the request (${response.status}).`);
    const { id } = await response.json();
    if (typeof id !== "string" || !id) throw new Error("Email provider returned no message ID.");
    return id;
  };
}
