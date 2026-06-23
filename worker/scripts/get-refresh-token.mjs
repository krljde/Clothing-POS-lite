#!/usr/bin/env node
// One-off helper: exchange a Google OAuth consent for a Gmail refresh_token.
//
// Prereqs (Google Cloud Console, one time):
//   - Create an OAuth client of type "Web application".
//   - Enable the Gmail API.
//   - Configure the OAuth consent screen (Testing is fine; add the SHOP base Gmail as a test user).
//   - Add this Authorized redirect URI to the client:
//         http://localhost:5555/oauth2callback
//
// Run:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node worker/scripts/get-refresh-token.mjs
//   (Windows PowerShell:  $env:GOOGLE_CLIENT_ID="xxx"; $env:GOOGLE_CLIENT_SECRET="yyy"; node worker/scripts/get-refresh-token.mjs)
//
// Sign in with the SHOP base Gmail when the browser opens. The printed refresh_token goes into:
//   wrangler secret put GMAIL_REFRESH_TOKEN
//
// Needs Node 18+ (uses the built-in global fetch). Stores nothing; prints to the terminal only.

import http from 'node:http';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables first.');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline', // required to get a refresh_token
  prompt: 'consent',      // force the refresh_token even on re-consent
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') { res.writeHead(404); res.end('not found'); return; }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error || !code) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Authorization failed: ' + (error || 'no code returned'));
    console.error('\nAuthorization failed:', error || 'no code returned');
    server.close(); process.exit(1);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(typeof data === 'object' ? JSON.stringify(data) : String(data));

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Done — check the terminal for your refresh token. You can close this tab.');

    if (!data.refresh_token) {
      console.error('\nNo refresh_token was returned. Google only sends one on first consent.');
      console.error('Revoke this app at https://myaccount.google.com/permissions and re-run');
      console.error('(prompt=consent + access_type=offline are already set).');
    } else {
      console.log('\n================= GMAIL_REFRESH_TOKEN =================\n');
      console.log(data.refresh_token);
      console.log('\n======================================================\n');
      console.log('Set it on the Worker:');
      console.log('  cd worker && wrangler secret put GMAIL_REFRESH_TOKEN');
      console.log('  (paste the value above when prompted)\n');
    }
  } catch (e) {
    res.writeHead(500); res.end('token exchange failed (see terminal)');
    console.error('\nToken exchange failed:', e.message);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 150);
  }
});

server.listen(PORT, () => {
  console.log('\nStep 1 — confirm this redirect URI is registered in your Google OAuth client:');
  console.log('   ' + REDIRECT_URI);
  console.log('\nStep 2 — open this URL and sign in with the SHOP base Gmail:\n');
  console.log('   ' + authUrl + '\n');
  console.log('Waiting for the consent redirect on ' + REDIRECT_URI + ' ...');
});
