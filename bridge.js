import http from "http";
import WebSocket from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import yts from "yt-search";

// --- Dummy HTTP server so Render's free "Web Service" port-scan passes ---
// Render's free tier requires an open port for Web Services. Our real work
// happens over an outbound WebSocket connection, so this server exists only
// to satisfy that check and does nothing else.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Music MCP bridge is running.\n");
  })
  .listen(PORT, () => {
    console.log(`Dummy HTTP server listening on port ${PORT} (for Render port-scan only)`);
  });

// XiaoZhi MCP endpoint — set this via environment variable on Render
const XIAOZHI_ENDPOINT = process.env.XIAOZHI_MCP_ENDPOINT;

// Serper.dev API key for real-time web search
const SERPER_API_KEY = process.env.SERPER_API_KEY;

if (!XIAOZHI_ENDPOINT) {
  console.error(
    "ERROR: XIAOZHI_MCP_ENDPOINT environment variable is not set. " +
      "Set it to the wss://api.xiaozhi.me/mcp/?token=... URL from your XiaoZhi console."
  );
  process.exit(1);
}

// --- Saved songs playlist ---
// Add more songs here as {names: [...aliases in Bangla/English], url: "direct mp3 link"}.
// Google Drive share links are converted to a direct-download form.
function toDirectDriveLink(shareUrl) {
  const match = shareUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return shareUrl;
  const fileId = match[1];
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

const SAVED_SONGS = [
  {
    number: 1,
    names: [
      "বোঝেনা সে বোঝেনা",
      "Bojhena Se Bojhena",
      "Bojhena Se Bojhenaa",
      "Bujhena Se Bujhena",
      "১ নাম্বার গান",
      "১ নং গান",
      "গান ১",
      "song 1",
      "song one",
      "number 1",
      "1 no gaan",
      "ekk no gaan",
    ],
    url: toDirectDriveLink(
      "https://drive.google.com/file/d/1A_8FPZtsscBAV-jBA_ztCvbwKyi8SkRD/view?usp=drivesdk"
    ),
  },
  {
    number: 2,
    names: [
      "পিয়া আইয়া না",
      "Piya Aiya Na",
      "Piya Aiyo Na",
      "২ নাম্বার গান",
      "২ নং গান",
      "গান ২",
      "song 2",
      "song two",
      "number 2",
      "2 no gaan",
      "dui no gaan",
    ],
    url: toDirectDriveLink(
      "https://drive.google.com/file/d/1S3e8pm00gPpYhmG-EbQ42UibMnwlKnQS/view?usp=drivesdk"
    ),
  },
  {
    number: 3,
    names: [
      "কাহা গায়ি হো রাত",
      "Kaha Gayi Ho Raat",
      "Kaha Gayi Ho Rat",
      "৩ নাম্বার গান",
      "৩ নং গান",
      "গান ৩",
      "song 3",
      "song three",
      "number 3",
      "3 no gaan",
      "tin no gaan",
    ],
    url: toDirectDriveLink(
      "https://drive.google.com/file/d/1pWNE1XM54j2PiTFYRZkPB7KLAn7JhY2z/view?usp=drivesdk"
    ),
  },
  {
    number: 4,
    names: [
      "কত রাত জাগা",
      "Koto Rat Jaga",
      "Kato Raat Jaga",
      "৪ নাম্বার গান",
      "৪ নং গান",
      "গান ৪",
      "song 4",
      "song four",
      "number 4",
      "4 no gaan",
      "char no gaan",
    ],
    url: toDirectDriveLink(
      "https://drive.google.com/file/d/1m4-tl2ag6YBwOOhVuN6hE2KbPpnX0ccc/view?usp=drivesdk"
    ),
  },
];

function findSavedSong(query) {
  const q = query.trim().toLowerCase();

  // Direct number match, e.g. "1", "one", "song 1"
  const digitMatch = q.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    const byNumber = SAVED_SONGS.find((s) => s.number === num);
    if (byNumber) return byNumber;
  }

  for (const song of SAVED_SONGS) {
    for (const name of song.names) {
      if (name.toLowerCase().includes(q) || q.includes(name.toLowerCase())) {
        return song;
      }
    }
  }
  return null;
}

// --- Simple in-memory notes/todo list ---
// Note: this resets when the server restarts (Render free tier may restart
// periodically). For persistent storage across restarts, this would need a
// database — fine for now as a lightweight notes list.
const NOTES = [];

// --- Simple in-memory timers ---
const TIMERS = [];
let timerIdCounter = 1;

// --- Simple in-memory alarms (clock-time based) ---
const ALARMS = [];
let alarmIdCounter = 1;

function buildServer() {
  const server = new McpServer({
    name: "music-search-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "search_music",
    {
      title: "Search Music",
      description:
        "Search YouTube for a song or music track by name/artist and return the best match with a playable link.",
      inputSchema: {
        query: z.string().describe("Song name, artist, or search text"),
      },
    },
    async ({ query }) => {
      try {
        const r = await yts(query);
        const videos = r.videos.slice(0, 5);
        if (videos.length === 0) {
          return { content: [{ type: "text", text: `No results found for "${query}".` }] };
        }
        const lines = videos.map(
          (v, i) => `${i + 1}. ${v.title} — ${v.author.name} (${v.timestamp}) | ${v.url}`
        );
        return {
          content: [
            {
              type: "text",
              text:
                `Top results for "${query}":\n` +
                lines.join("\n") +
                `\n\nBest match to play: ${videos[0].title} — ${videos[0].url}`,
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Search failed: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "play_music",
    {
      title: "Play Music",
      description: "Find a song by name and return its direct playable URL so the device can stream/play it.",
      inputSchema: {
        query: z.string().describe("Song name or artist to play"),
      },
    },
    async ({ query }) => {
      try {
        const r = await yts(query);
        const v = r.videos[0];
        if (!v) {
          return { content: [{ type: "text", text: `Couldn't find "${query}".` }] };
        }
        return {
          content: [
            {
              type: "text",
              text: `Playing: ${v.title} — ${v.author.name}\nURL: ${v.url}\nDuration: ${v.timestamp}`,
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Playback lookup failed: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "play_saved_song",
    {
      title: "Play Saved Song",
      description:
        "Play a song from the saved/uploaded playlist by name (Bangla or English) OR by its number (1, 2, 3, 4...). Use this FIRST before searching YouTube, since these are pre-approved songs the device can actually play. If the user says a number like '1 no gaan' or 'song 1' or just '1', pass that number as the query.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Song name or number, e.g. 'Bojhena Se Bojhena', 'বোঝেনা সে বোঝেনা', '1', or 'song 1'"
          ),
      },
    },
    async ({ query }) => {
      const song = findSavedSong(query);
      if (!song) {
        return {
          content: [
            {
              type: "text",
              text: `"${query}" is not in the saved playlist yet. Try search_music to find it on YouTube instead, or call list_saved_songs to see available songs and their numbers.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Playing saved song #${song.number}: ${song.names[0]}\nURL: ${song.url}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_saved_songs",
    {
      title: "List Saved Songs",
      description:
        "List all songs in the saved playlist along with their numbers, so the user can pick one by number (e.g. 'play song 1').",
      inputSchema: {},
    },
    async () => {
      const lines = SAVED_SONGS.map((s) => `${s.number}. ${s.names[0]}`);
      return {
        content: [
          {
            type: "text",
            text: `Saved songs:\n${lines.join("\n")}\n\nSay the song number or name to play it.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "web_search",
    {
      title: "Web Search",
      description:
        "Search the web for current, real-time information — news, current office holders (e.g. prime ministers, presidents, CEOs), recent events, or anything that may have changed since the AI's training data. Use this whenever the user asks about current events or facts that could be outdated.",
      inputSchema: {
        query: z.string().describe("Search query, e.g. 'current prime minister of Bangladesh'"),
      },
    },
    async ({ query }) => {
      if (!SERPER_API_KEY) {
        return {
          content: [{ type: "text", text: "Web search is not configured (missing API key)." }],
          isError: true,
        };
      }
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: query }),
        });
        const data = await res.json();

        const parts = [];
        if (data.answerBox) {
          const ab = data.answerBox;
          parts.push(`Answer: ${ab.answer || ab.snippet || ""}`);
        }
        if (data.knowledgeGraph) {
          const kg = data.knowledgeGraph;
          parts.push(`${kg.title}: ${kg.description || ""}`);
        }
        if (data.organic && data.organic.length > 0) {
          const top = data.organic.slice(0, 3);
          parts.push(
            "Top results:\n" +
              top.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet || ""}`).join("\n")
          );
        }

        if (parts.length === 0) {
          return { content: [{ type: "text", text: `No results found for "${query}".` }] };
        }

        return { content: [{ type: "text", text: parts.join("\n\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Search failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "add_note",
    {
      title: "Add Note",
      description:
        "Save a note or to-do item for the user to remember later. Use this when the user says things like 'note this down', 'remember this', 'নোট করে রাখো', or 'মনে রাখো'.",
      inputSchema: {
        text: z.string().describe("The note or reminder text to save, in the language the user spoke it"),
      },
    },
    async ({ text }) => {
      const note = {
        id: NOTES.length + 1,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };
      NOTES.push(note);
      return {
        content: [
          {
            type: "text",
            text: `Saved note #${note.id}: "${note.text}"`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description:
        "Read back all saved notes/to-do items. Use this when the user asks 'আমার নোট বলো', 'what did I ask you to remember', or similar.",
      inputSchema: {},
    },
    async () => {
      if (NOTES.length === 0) {
        return { content: [{ type: "text", text: "There are no saved notes yet." }] };
      }
      const lines = NOTES.map((n) => `${n.id}. ${n.text}`);
      return { content: [{ type: "text", text: `Saved notes:\n${lines.join("\n")}` }] };
    }
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description:
        "Delete a saved note by its number. Use this when the user says 'delete note 2' or 'নোট ২ মুছে দাও'.",
      inputSchema: {
        id: z.number().describe("The note number to delete"),
      },
    },
    async ({ id }) => {
      const idx = NOTES.findIndex((n) => n.id === id);
      if (idx === -1) {
        return { content: [{ type: "text", text: `No note found with number ${id}.` }] };
      }
      const [removed] = NOTES.splice(idx, 1);
      return { content: [{ type: "text", text: `Deleted note #${removed.id}: "${removed.text}"` }] };
    }
  );

  server.registerTool(
    "set_timer",
    {
      title: "Set Timer",
      description:
        "Set a countdown timer for a number of minutes or seconds. Use this when the user says 'set a 10 minute timer', '১০ মিনিটের টাইমার দাও', or similar. Announce when it's created; when the user later asks to check timers, use check_timers to tell them the remaining time.",
      inputSchema: {
        duration_seconds: z.number().describe("Timer duration in seconds, e.g. 600 for 10 minutes"),
        label: z.string().optional().describe("Optional label for what the timer is for, e.g. 'chai'"),
      },
    },
    async ({ duration_seconds, label }) => {
      const timer = {
        id: timerIdCounter++,
        label: label || null,
        durationSeconds: duration_seconds,
        endsAt: Date.now() + duration_seconds * 1000,
      };
      TIMERS.push(timer);
      const mins = Math.floor(duration_seconds / 60);
      const secs = duration_seconds % 60;
      const durText = mins > 0 ? `${mins} min ${secs > 0 ? secs + " sec" : ""}`.trim() : `${secs} sec`;
      return {
        content: [
          {
            type: "text",
            text: `Timer #${timer.id} set for ${durText}${label ? ` (${label})` : ""}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "check_timers",
    {
      title: "Check Timers",
      description:
        "Check all active timers and how much time is left on each. Use this when the user asks 'how much time is left', 'আর কত সময় বাকি', or similar. Timers that have finished will be reported as done.",
      inputSchema: {},
    },
    async () => {
      const now = Date.now();
      // Clean up timers that finished more than 5 minutes ago
      for (let i = TIMERS.length - 1; i >= 0; i--) {
        if (now - TIMERS[i].endsAt > 5 * 60 * 1000) TIMERS.splice(i, 1);
      }
      if (TIMERS.length === 0) {
        return { content: [{ type: "text", text: "There are no active timers." }] };
      }
      const lines = TIMERS.map((t) => {
        const remaining = Math.round((t.endsAt - now) / 1000);
        const name = t.label ? ` (${t.label})` : "";
        if (remaining <= 0) return `Timer #${t.id}${name}: DONE`;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        return `Timer #${t.id}${name}: ${mins}m ${secs}s remaining`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "cancel_timer",
    {
      title: "Cancel Timer",
      description: "Cancel a timer by its number. Use this when the user says 'cancel timer 1' or 'টাইমার বাতিল করো'.",
      inputSchema: {
        id: z.number().describe("The timer number to cancel"),
      },
    },
    async ({ id }) => {
      const idx = TIMERS.findIndex((t) => t.id === id);
      if (idx === -1) {
        return { content: [{ type: "text", text: `No timer found with number ${id}.` }] };
      }
      TIMERS.splice(idx, 1);
      return { content: [{ type: "text", text: `Timer #${id} cancelled.` }] };
    }
  );

  server.registerTool(
    "set_alarm",
    {
      title: "Set Alarm",
      description:
        "Set an alarm for a specific clock time (hour and minute, 24-hour format). Use this when the user says 'wake me up at 7am', 'সকাল ৭টায় অ্যালার্ম দাও', or similar. If the time has already passed today, it will be set for tomorrow.",
      inputSchema: {
        hour: z.number().describe("Hour in 24-hour format, 0-23"),
        minute: z.number().describe("Minute, 0-59"),
        label: z.string().optional().describe("Optional label, e.g. 'ঘুম থেকে ওঠা'"),
      },
    },
    async ({ hour, minute, label }) => {
      const now = new Date();
      const alarmTime = new Date(now);
      alarmTime.setHours(hour, minute, 0, 0);
      if (alarmTime.getTime() <= now.getTime()) {
        alarmTime.setDate(alarmTime.getDate() + 1);
      }
      const alarm = {
        id: alarmIdCounter++,
        hour,
        minute,
        label: label || null,
        triggersAt: alarmTime.getTime(),
      };
      ALARMS.push(alarm);
      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const dayText = alarmTime.getDate() !== now.getDate() ? "tomorrow" : "today";
      return {
        content: [
          {
            type: "text",
            text: `Alarm #${alarm.id} set for ${timeStr} ${dayText}${label ? ` (${label})` : ""}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "check_alarms",
    {
      title: "Check Alarms",
      description:
        "List all upcoming alarms and how much time is left until each. Use this when the user asks 'what alarms do I have', 'আমার অ্যালার্ম কী কী আছে', or similar.",
      inputSchema: {},
    },
    async () => {
      const now = Date.now();
      // Remove alarms more than 5 minutes past due (assume acknowledged)
      for (let i = ALARMS.length - 1; i >= 0; i--) {
        if (now - ALARMS[i].triggersAt > 5 * 60 * 1000) ALARMS.splice(i, 1);
      }
      if (ALARMS.length === 0) {
        return { content: [{ type: "text", text: "There are no alarms set." }] };
      }
      const lines = ALARMS.map((a) => {
        const timeStr = `${String(a.hour).padStart(2, "0")}:${String(a.minute).padStart(2, "0")}`;
        const name = a.label ? ` (${a.label})` : "";
        const remainingMin = Math.round((a.triggersAt - now) / 60000);
        const status = remainingMin <= 0 ? "DUE NOW" : `in ${remainingMin} min`;
        return `Alarm #${a.id} at ${timeStr}${name} — ${status}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "cancel_alarm",
    {
      title: "Cancel Alarm",
      description: "Cancel an alarm by its number. Use this when the user says 'cancel alarm 1' or 'অ্যালার্ম বাতিল করো'.",
      inputSchema: {
        id: z.number().describe("The alarm number to cancel"),
      },
    },
    async ({ id }) => {
      const idx = ALARMS.findIndex((a) => a.id === id);
      if (idx === -1) {
        return { content: [{ type: "text", text: `No alarm found with number ${id}.` }] };
      }
      ALARMS.splice(idx, 1);
      return { content: [{ type: "text", text: `Alarm #${id} cancelled.` }] };
    }
  );

  return server;
}

// --- WebSocket bridge: connects OUT to XiaoZhi's endpoint and speaks MCP JSON-RPC over it ---
class WebSocketBridgeTransport {
  constructor(ws) {
    this.ws = ws;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  async start() {
    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.onmessage?.(msg);
      } catch (err) {
        console.error("Failed to parse incoming message:", err);
      }
    });
    this.ws.on("close", () => this.onclose?.());
    this.ws.on("error", (err) => this.onerror?.(err));
  }
  async send(message) {
    this.ws.send(JSON.stringify(message));
  }
  async close() {
    this.ws.close();
  }
}

function connect() {
  console.log("Connecting to XiaoZhi MCP endpoint...");
  const ws = new WebSocket(XIAOZHI_ENDPOINT);

  ws.on("open", async () => {
    console.log("Connected to XiaoZhi. Registering music tools...");
    const server = buildServer();
    const transport = new WebSocketBridgeTransport(ws);
    await server.connect(transport);
    console.log("Music MCP tools are now live on the XiaoZhi agent.");
  });

  ws.on("close", () => {
    console.log("Disconnected from XiaoZhi. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

connect();
