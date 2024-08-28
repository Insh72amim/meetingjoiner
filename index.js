import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import open from "open";
import schedule from "node-schedule";

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 *   Global set to store the attended events
 */
const attendedEvents = new Set();

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listEvents(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });
  const events = res.data.items;
  if (!events || events.length === 0) {
    console.log("No upcoming events found.");
    return;
  }

  console.log("Upcoming 10 events:");
  events.map((event, i) => {
    const meetingNote = event.conferenceData?.notes;
    const urls = meetingNote?.split("_blank");
    if (urls && urls.length > 2) {
      // meeting details
      const start = event?.start?.dateTime;
      const end = event?.end?.dateTime;
      const zoomurl = urls[2].substring(2).slice(0, -4);

      // logs
      console.log("Meeting title is :", event.summary);
      console.log("start time is :", start, "and end time is :", end);
      console.log("zoom url is :", zoomurl);

      if (start && end) {
        const startTime = new Date(start);
        const endTime = new Date(end);
        if (
          startTime.getTime() <= new Date().getTime() &&
          endTime.getTime() > new Date().getTime()
        ) {
          if (!attendedEvents.has(zoomurl)) {
            attendedEvents.add(zoomurl);
            open(zoomurl);
          }
        }
      }
    }
  });
}

schedule.scheduleJob("*/1 * * * *", async function () {
  console.log(
    `\n\n\n<<<<------------    This job Ran at ${new Date()}   ------------------------------->>>>\n\n\n`
  );
  await authorize().then(listEvents).catch(console.error);
  console.log(
    `\n\n\n<<<<<---------------------------------------------------------------------->>>>>>\n\n\n`
  );
});
