# Clothing POS OTP Worker

Small Cloudflare Worker for the POS booker flow. It exposes only:

- `GET /health`
- `GET /code?address=<dotEmail>`

`/code` requires a Firebase ID token in `Authorization: Bearer <token>`, verifies it against the `shein-pos` Firebase project, checks that the requested address is a dot variant of the single shop Gmail, then reads the latest matching Gmail message and returns the newest OTP/binding code.

## One-Time Operator Setup

1. In Google Cloud Console, enable the Gmail API.
2. Create an OAuth Web client.
3. Configure the OAuth consent screen with the `gmail.readonly` scope.
4. Add the shop Gmail as a Test user using the DOTLESS address:
   `naddieclo@gmail.com`
5. Add this authorized redirect URI to the OAuth Web client:
   `http://localhost:5555/oauth2callback`
6. Get a refresh token:
   ```bash
   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node worker/scripts/get-refresh-token.mjs
   ```
   PowerShell:
   ```powershell
   $env:GOOGLE_CLIENT_ID="xxx"
   $env:GOOGLE_CLIENT_SECRET="yyy"
   node worker/scripts/get-refresh-token.mjs
   ```
7. Important: Testing-status refresh tokens expire in 7 days for `gmail.readonly`. Publish the consent screen to Production, then re-run `worker/scripts/get-refresh-token.mjs` for a durable token.
8. Create the KV namespace and put its id in `wrangler.toml`:
   ```bash
   cd worker
   npx wrangler kv namespace create CACHE_KV
   ```
9. Set Worker secrets. Do not put these in files:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GMAIL_REFRESH_TOKEN
   ```
10. Confirm these vars in `wrangler.toml`:
    ```toml
    GMAIL_BASE = "naddieclo@gmail.com"
    FIREBASE_PROJECT_ID = "shein-pos"
    FRONTEND_ORIGIN = "https://krljde.github.io"
    ```
11. Deploy:
    ```bash
    npx wrangler deploy
    ```

## Local Checks

```bash
cd worker
npm install
npx tsc --noEmit
npx wrangler deploy --dry-run
```

Full `/code` testing requires the real Cloudflare secrets and the shop Gmail refresh token. Without a token, `/health` can be checked and `/code` should return `401` when `Authorization` is missing.
