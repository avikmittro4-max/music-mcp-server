import WebSocket from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import yts from "yt-search";

// XiaoZhi MCP endpoint — set this via environment variable on Render
const XIAOZHI_ENDPOINT = process.env.XIAOZHI_MCP_ENDPOINT;

if (!XIAOZHI_ENDPOINT) {
  console.error(
    "ERROR: XIAOZHI_MCP_ENDPOINT environment variable is not set. " +
      "Set it to the wss://api.xiaozhi.me/mcp/?token=... URL from your XiaoZhi console."
  );
  process.exit(1);
}

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
