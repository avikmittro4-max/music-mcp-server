import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import yts from "yt-search";

const app = express();
app.use(express.json());

function buildServer() {
  const server = new McpServer({
    name: "music-search-mcp",
    version: "1.0.0",
  });

  // Tool: search_music
  server.registerTool(
    "search_music",
    {
      title: "Search Music",
      description:
        "Search YouTube for a song or music track by name/artist and return the best match with a playable link.",
      inputSchema: {
        query: z.string().describe("Song name, artist, or search text, e.g. 'Tomake Chai Beje'"),
      },
    },
    async ({ query }) => {
      try {
        const r = await yts(query);
        const videos = r.videos.slice(0, 5);
        if (videos.length === 0) {
          return {
            content: [{ type: "text", text: `No results found for "${query}".` }],
          };
        }
        const lines = videos.map(
          (v, i) =>
            `${i + 1}. ${v.title} — ${v.author.name} (${v.timestamp}) | ${v.url}`
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
        return {
          content: [{ type: "text", text: `Search failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: play_music (returns the direct URL/instructions; actual playback is device-side)
  server.registerTool(
    "play_music",
    {
      title: "Play Music",
      description:
        "Find a song by name and return its direct playable URL so the device can stream/play it.",
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
        return {
          content: [{ type: "text", text: `Playback lookup failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Stateless streamable HTTP endpoint — each request gets a fresh transport
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/", (req, res) => {
  res.send("Music MCP server is running. POST to /mcp for MCP requests.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Music MCP server listening on port ${PORT}`);
});
