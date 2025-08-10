// mcp_server_sdk.ts
// MCP stdio server implemented using the official @modelcontextprotocol/sdk package.
// This file exposes a small set of MCP *tools* that mirror the RPC-like operations
// you previously had (create_session, start_have, add_command, finalize, serialize, ...)
// and internally delegates to the ProofSession from `chinese_theorem_prover.ts`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import proverMod from "./main/index.js";

const { ProofSession } = (proverMod as any) as { ProofSession: any };

type SessionRecord = { id: string; sess: any; createdAt: number };

export async function startMcpServer(opts: { name?: string; version?: string; port?: number } = {}) {
  const server = new McpServer({ name: opts.name ?? "proofsession-mcp", version: opts.version ?? "0.1.0" });
  const transport = new StdioServerTransport();

  // in-memory sessions map
  const sessions = new Map<string, SessionRecord>();
  let counter = 0;
  function nextId() { return `sess_${++counter}`; }

  // helper to format a tool response (text content)
  const textResp = (s: string) => ({ content: [{ type: "text", text: String(s) }] });

  // Register tools that correspond to the earlier stdio RPC methods.

  server.registerTool(
    "create_session",
    {
      title: "Create ProofSession",
      description: "Create a new ProofSession (returns sessionId)",
      inputSchema: z.object({ initialFacts: z.array(z.any()).optional(), rules: z.any().optional() })
    },
    async ({ initialFacts, rules }) => {
      const id = nextId();
      // create and store ProofSession
      const sess = new ProofSession(initialFacts || [], rules || undefined);
      sess.setLogger((m: string) => server.emitEvent("notifications/log", { sessionId: id, message: m, ts: Date.now() }));
      sessions.set(id, { id, sess, createdAt: Date.now() });
      return textResp(JSON.stringify({ sessionId: id }));
    }
  );

  server.registerTool(
    "seed_global",
    {
      title: "Seed Global Context",
      description: "Seed the global context of a session",
      inputSchema: z.object({ sessionId: z.string(), initialFacts: z.array(z.any()), overwrite: z.boolean().optional() })
    },
    async ({ sessionId, initialFacts, overwrite = false }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ ok: false, message: "session not found" }));
      const res = rec.sess.seedGlobalContext(initialFacts || [], overwrite);
      server.emitEvent("notifications/resources/list_changed", { sessionId });
      return textResp(JSON.stringify(res));
    }
  );

  server.registerTool(
    "start_have",
    {
      title: "Start Have (startHave)",
      description: "Open a new proof frame for a session",
      inputSchema: z.object({ sessionId: z.string(), name: z.string(), goal: z.any(), parentFrameId: z.string().optional() })
    },
    async ({ sessionId, name, goal, parentFrameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ error: "session not found" }));
      try {
        const frameId = rec.sess.startHave(name, goal, parentFrameId);
        server.emitEvent("frames/started", { sessionId, frameId, name });
        return textResp(JSON.stringify({ frameId }));
      } catch (e) {
        return textResp(JSON.stringify({ error: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "add_command",
    {
      title: "Add Command",
      description: "Add a command to a frame",
      inputSchema: z.object({ sessionId: z.string(), frameId: z.string(), cmd: z.any() })
    },
    async ({ sessionId, frameId, cmd }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ ok: false, message: "session not found" }));
      try {
        const res = rec.sess.addCommand(frameId, cmd);
        server.emitEvent("frames/command_applied", { sessionId, frameId, cmd: cmd?.cmd || cmd });
        return textResp(JSON.stringify(res));
      } catch (e) {
        return textResp(JSON.stringify({ ok: false, message: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "finalize",
    {
      title: "Finalize Frame",
      description: "Finalize a frame and promote its fact",
      inputSchema: z.object({ sessionId: z.string(), frameId: z.string() })
    },
    async ({ sessionId, frameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ ok: false, message: "session not found" }));
      try {
        const res = rec.sess.finalize(frameId);
        if (res && (res as any).ok) server.emitEvent("frames/finalized", { sessionId, frameId });
        return textResp(JSON.stringify(res));
      } catch (e) {
        return textResp(JSON.stringify({ ok: false, message: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "serialize",
    {
      title: "Serialize ProofSession",
      description: "Serialize the session to a self-contained proof script",
      inputSchema: z.object({ sessionId: z.string() })
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ error: "session not found" }));
      try {
        const serialized = rec.sess.serializeAll();
        return { content: [{ type: "text", text: serialized }] };
      } catch (e) {
        return textResp(JSON.stringify({ error: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "list_frames",
    {
      title: "List Frames",
      description: "Return frame ids for a session",
      inputSchema: z.object({ sessionId: z.string() })
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ error: "session not found" }));
      try {
        const frames = rec.sess.listFrames();
        return textResp(JSON.stringify({ frames }));
      } catch (e) { return textResp(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "get_frame",
    {
      title: "Get Frame",
      description: "Return a frame state",
      inputSchema: z.object({ sessionId: z.string(), frameId: z.string() })
    },
    async ({ sessionId, frameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ error: "session not found" }));
      try {
        const frame = rec.sess.getFrameState(frameId);
        return textResp(JSON.stringify({ frame }));
      } catch (e) { return textResp(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "get_global",
    {
      title: "Get Global Context Keys",
      description: "Return global context keys and facts",
      inputSchema: z.object({ sessionId: z.string() })
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textResp(JSON.stringify({ error: "session not found" }));
      try {
        const keys = rec.sess.getGlobalContextKeys();
        // attempt to get facts from internal globalContext if available
        const sessAny = rec.sess as any;
        const facts: Record<string, any> = {};
        if (sessAny && sessAny.globalContext && typeof sessAny.globalContext.getFact === 'function') {
          for (const k of keys) facts[k] = sessAny.globalContext.getFact(k);
        }
        return textResp(JSON.stringify({ keys, facts }));
      } catch (e) { return textResp(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "shutdown",
    {
      title: "Shutdown Server",
      description: "Shutdown the MCP server (for local use only)",
      inputSchema: z.object({ confirm: z.literal(true) })
    },
    async ({ confirm }) => {
      if (confirm !== true) return textResp(JSON.stringify({ ok: false, message: "must confirm with true" }));
      // small delay so MCP client receives the reply
      setTimeout(() => process.exit(0), 20);
      return textResp(JSON.stringify({ ok: true }));
    }
  );

  // connect transport and start listening on stdio
  await server.connect(transport);
  server.emitEvent("server/ready", { ts: Date.now(), name: opts.name ?? "proofsession-mcp" });

  // graceful shutdown
  process.on("SIGINT", () => {
    server.emitEvent("server/shutdown", { ts: Date.now() });
    process.exit(0);
  });

  return { server, transport, sessions };
}

// If run directly, start the server
if (require.main === module) {
  (async () => {
    try {
      await startMcpServer();
      // eslint-disable-next-line no-console
      console.log("MCP server (SDK) started on stdio");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to start MCP server:", e);
      process.exit(1);
    }
  })();
}

export default startMcpServer;
