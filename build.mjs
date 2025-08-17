import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import slugify from "slugify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  DRIVE_FOLDER_ID,
  OUTPUT_DIR = "dist",
  SITE_TITLE = "My Docs Site",
} = process.env;

if (
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !GOOGLE_REDIRECT_URI ||
  !DRIVE_FOLDER_ID
) {
  console.error("Missing required env vars. Check .env");
  process.exit(1);
}

// Load saved tokens from auth step
let tokens;
try {
  tokens = JSON.parse(
    await fs.readFile(path.join(__dirname, "tokens.json"), "utf-8")
  );
} catch (e) {
  console.error("Missing tokens.json. Run `npm run auth` first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials(tokens);
const drive = google.drive({ version: "v3", auth: oauth2Client });

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readTemplate() {
  const p = path.join(__dirname, "template.html");
  return fs.readFile(p, "utf-8");
}

function applyTemplate(tpl, { title, siteTitle, content, nav = "" }) {
  return tpl
    .replaceAll("{{title}}", title)
    .replaceAll("{{siteTitle}}", siteTitle)
    .replaceAll("{{nav}}", nav)
    .replace("{{content}}", content);
}

function toSlug(name) {
  return slugify(name, { lower: true, strict: true });
}

async function listDocsInFolder(folderId) {
  const files = [];
  let pageToken = undefined;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
      fields: "nextPageToken, files(id, name, webViewLink, modifiedTime)",
      pageSize: 1000,
      pageToken,
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  // sort by name for stable nav
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

async function exportDocHtml(fileId) {
  const res = await drive.files.export(
    { fileId, mimeType: "text/html" },
    { responseType: "stream" }
  );
  return new Promise((resolve, reject) => {
    let html = "";
    res.data.on("data", (chunk) => (html += chunk.toString("utf8")));
    res.data.on("end", () => resolve(html));
    res.data.on("error", reject);
  });
}

async function buildSite() {
  await ensureDir(OUTPUT_DIR);
  const template = await readTemplate();
  const docs = await listDocsInFolder(DRIVE_FOLDER_ID);
  if (!docs.length) {
    console.warn("No Google Docs found in the folder.");
  }

  // Build nav links
  const nav = docs
    .map((f) => `<a href="./${toSlug(f.name)}.html">${f.name}</a>`)
    .join("");

  // Generate per-doc pages
  for (const f of docs) {
    const raw = await exportDocHtml(f.id);
    // Drive's HTML includes a full HTML doc; we want the body inner HTML.
    const contentMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = contentMatch ? contentMatch[1] : raw; // fallback
    const html = applyTemplate(template, {
      title: f.name,
      siteTitle: SITE_TITLE,
      content,
      nav,
    });
    const outPath = path.join(OUTPUT_DIR, `${toSlug(f.name)}.html`);
    await fs.writeFile(outPath, html, "utf-8");
    console.log("✓", f.name);
  }

  // Index page
  const indexList = docs
    .map((f) => `<li><a href="./${toSlug(f.name)}.html">${f.name}</a></li>`)
    .join("");
  const indexHtml = applyTemplate(template, {
    title: SITE_TITLE,
    siteTitle: SITE_TITLE,
    nav,
    content: `<h2>${SITE_TITLE}</h2><ul>${indexList}</ul>`,
  });
  await fs.writeFile(path.join(OUTPUT_DIR, "index.html"), indexHtml, "utf-8");
  console.log("\nBuilt", docs.length, "page(s) →", OUTPUT_DIR);
}

buildSite().catch((e) => {
  console.error(e?.response?.data || e);
  process.exit(1);
});
