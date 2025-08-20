import { google } from "googleapis";

export async function handler(event, context) {
  try {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_DOC_ID,
    } = process.env;

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      "http://localhost" // redirect not used here
    );

    oauth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN,
    });

    // Get a new access token automatically
    const docs = google.docs({ version: "v1", auth: oauth2Client });

    const doc = await docs.documents.get({
      documentId: GOOGLE_DOC_ID,
    });

    // Simple extract: just text content
    const content = doc.data.body.content
      .map(
        (e) =>
          e.paragraph?.elements
            ?.map((el) => el.textRun?.content || "")
            .join("") || ""
      )
      .join("\n");

    return {
      statusCode: 200,
      body: JSON.stringify({ content }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
