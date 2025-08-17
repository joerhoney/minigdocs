// Run npm run auth, open the printed URL, grant access, and
// your tokens.json (with Refresh Token) will be saved locally.
import "dotenv/config";
import http from "http";
import { google } from "googleapis";
import fs from "fs";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
  process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error("Missing Google OAuth env vars. Check your .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

console.log("\nAuthorize this app by visiting:\n", authUrl, "\n");

// Simple local server to receive the OAuth redirect
http
  .createServer(async (req, res) => {
    if (!req.url.startsWith("/oauth2callback")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("Waiting for OAuth redirect...");
    }
    const url = new URL(req.url, `http://localhost:${server.address().port}`);
    const code = url.searchParams.get("code");
    try {
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync("./tokens.json", JSON.stringify(tokens, null, 2));
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Success! tokens.json saved. You can close this tab.");
      console.log("\nSaved tokens to tokens.json");
      server.close();
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end("Auth failed. Check console.");
    }
  })
  .listen(5173, () => {
    console.log("Listening on http://localhost:5173 ...");
  });

const server = http.createServer();
