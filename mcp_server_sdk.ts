// mcp_server_sdk.ts
// MCP stdio server implemented using the official @modelcontextprotocol/sdk package.
//
// This file exposes a set of MCP *tools* that map to ProofSession operations
// (create_session, seed_global, start_have, add_command, finalize, serialize, etc.).
// The emphasis in this version is on extremely detailed argument schemas and
// descriptions so that LLMs (the primary consumers of this API) can reliably
// construct correct requests without external documentation.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import proverMod from "./main/index.js";

const { ProofSession } = (proverMod as any) as { ProofSession: any };

// -----------------------------
// Precise AST & Fact Schemas
// -----------------------------
// These schemas are intentionally explicit and descriptive. Each field includes
// `.describe()` metadata so an LLM can read the schema programmatically and
// construct valid values. The schemas mirror the AST types used by the
// chinese_theorem_prover module.

const VarNodeSchema = z.object({
  type: z.literal('var').describe('A variable reference. `name` should be a short identifier, e.g. "x", "a1", "z".'),
  name: z.string().describe('Variable name string. Avoid spaces; use letters, digits, underscore.')
}).describe('Variable AST node');

const ConstNodeSchema = z.object({
  type: z.literal('const').describe('A constant/literal node.'),
  value: z.union([z.string(), z.number()]).describe('Constant value. Use number for numeric constants and string for symbolic constants.')
}).describe('Constant AST node');

// Expr is recursive — use z.lazy so zod can express recursive structures
type ZExpr = z.ZodTypeAny;
const ExprSchema: ZExpr = z.lazy(() => z.union([
  VarNodeSchema,
  ConstNodeSchema,
  z.object({
    type: z.literal('op').describe('Operator node representing arithmetic or unary ops.'),
    op: z.enum(['add','sub','mul','div','neg','pow']).describe('Operator name. Use: add, sub, mul, div, neg, pow.'),
    args: z.array(ExprSchema).describe('Operator operands. For binary operators provide exactly two args; for add/mul it can be 2+; for neg provide a single argument.')
  }).describe('Operator AST node'),
  z.object({
    type: z.literal('func').describe('Function node to represent function application.'),
    name: z.string().describe('Function name, e.g. "conj", "Re", "Im", or a custom function identifier.'),
    args: z.array(ExprSchema).describe('Function arguments; can be empty or multiple depending on function semantics.')
  }).describe('Function AST node')
])).describe('Expression AST node (var | const | op | func)');

const FactEqSchema = z.object({
  kind: z.literal('eq').describe('Equality fact; asserts left-hand expression equals right-hand expression.'),
  lhs: ExprSchema.describe('Left-hand side expression.'),
  rhs: ExprSchema.describe('Right-hand side expression.')
}).describe('Equality Fact');

const FactNeqSchema = z.object({
  kind: z.literal('neq').describe('Inequality fact; asserts left-hand expression is not equal to right-hand expression.'),
  lhs: ExprSchema.describe('Left-hand side expression.'),
  rhs: ExprSchema.describe('Right-hand side expression.')
}).describe('Inequality Fact');

const FactSchema = z.discriminatedUnion('kind', [FactEqSchema, FactNeqSchema]).describe('Fact object (discriminated by kind=eq|neq).');

// -----------------------------
// Command Schemas (detailed)
// -----------------------------
// These match the in-memory Command union used by ProofSession. Field descriptions
// explain semantic constraints so an LLM can produce valid commands.

const CmdDuonengSchema = z.object({
  cmd: z.literal('多能').describe('Attempt to prove an equality by algebraic simplification. Use only on eq goals.'),
  denomProofs: z.array(z.string()).optional().describe('Optional list of fact names (strings) that prove denominators ≠ 0. Each must reference a session-local inequality fact (kind=neq) with rhs=0.')
}).describe('多能 command');

const CmdBuliSchema = z.object({
  cmd: z.literal('不利').describe('Extract a non-equality fact from a hypothesis. The hypothesis must be an inequality (neq).'),
  newName: z.string().describe('The name to assign the generated fact inside the current frame/context. Must be unique within that context.'),
  component: ExprSchema.describe('An expression expected to appear inside the hypothesis.lhs; the command will assert `component ≠ hypothesis.rhs`.'),
  hypothesis: z.string().describe('Name of the hypothesis fact (existing in the frame/global context) that is a `neq` and contains the component inside its lhs.')
}).describe('不利 command');

const CmdFanzhengSchema = z.object({
  cmd: z.literal('反证').describe('Perform a proof-by-contradiction transformation. Requires a named hypothesis that is a `neq` and the current goal must be `neq`.'),
  hypName: z.string().describe('The name of the hypothesis to toggle from `neq` → `eq` temporarily; this command will set the new sub-goal accordingly.')
}).describe('反证 command');

const CmdRewriteSchema = z.object({
  cmd: z.literal('再写').describe('Apply a named equality (either a context fact or a registered rewrite rule) at a specific occurrence within the current goal.'),
  occurrence: z.number().int().positive().optional().describe('1-based occurrence index within the list of matches. Default is 1 (first match). If omitted, the first occurrence will be used.'),
  equalityName: z.string().describe('Name of an equality fact or a registered named rewrite rule to apply. If this name exists as an eq fact in the frame/context it will be used; otherwise the server checks built-in rewrite rules.')
}).describe('再写 command');

const CmdReverseSchema = z.object({
  cmd: z.literal('重反').describe('Add a new equality fact that is the reverse of an existing equality fact. Useful to expose the inverted direction with a new name.'),
  oldName: z.string().describe('Existing equality fact name in the session or frame context.'),
  newName: z.string().describe('New name to assign the reversed equality fact.')
}).describe('重反 command');

const CmdCertainSchema = z.object({
  cmd: z.literal('确定').describe('Verify that both sides of an equality are syntactically constant and evaluate to the same value. Only succeeds if both sides are constant expressions.')
}).describe('确定 command');

const CommandSchema = z.discriminatedUnion('cmd', [CmdDuonengSchema, CmdBuliSchema, CmdFanzhengSchema, CmdRewriteSchema, CmdReverseSchema, CmdCertainSchema]).describe('Command object (一 of the supported commands).');

// -----------------------------
// Tool input schemas
// -----------------------------
// Each registered tool receives a strongly-typed input schema with detailed
// descriptions to help an LLM construct valid calls.

const CreateSessionInput = z.object({
  initialFacts: z.array(z.object({
    name: z.string().describe('Unique fact name: short string (alphanumeric, underscore, hyphen). Avoid spaces.'),
    fact: FactSchema.describe('Fact object as defined above (kind=eq|neq with AST expressions).')
  })).optional().describe('Optional array of initial facts to seed the session global context.'),
  rules: z.record(z.object({ lhs: ExprSchema, rhs: ExprSchema })).optional().describe('Optional map of named rewrite rules. Each value is an object with lhs and rhs expressions representing a rewrite rule.')
}).describe('create_session input: optionally seed a new ProofSession with facts and rules.');

const SeedGlobalInput = z.object({
  sessionId: z.string().describe('Session identifier returned by create_session.'),
  initialFacts: z.array(z.object({ name: z.string(), fact: FactSchema })).describe('Array of facts to seed into the session global context.'),
  overwrite: z.boolean().optional().describe('If true, overwrite existing facts with the same names. Default false.')
}).describe('seed_global input');

const StartHaveInput = z.object({
  sessionId: z.string().describe('Target session id.'),
  name: z.string().describe('Name for the new frame / fact when finalized. Use short, unique names.'),
  goal: FactSchema.describe('The goal fact that this frame will attempt to prove.'),
  parentFrameId: z.string().optional().describe('Optional parent frame id; if provided the new frame will inherit the parent context and will be finalized into the parent when complete.')
}).describe('start_have input');

const AddCommandInput = z.object({
  sessionId: z.string().describe('Target session id.'),
  frameId: z.string().describe('Target frame id returned from start_have.'),
  cmd: CommandSchema.describe('Command to execute in the frame. See CommandSchema for full details and constraints.')
}).describe('add_command input');

const FinalizeInput = z.object({
  sessionId: z.string().describe('Target session id.'),
  frameId: z.string().describe('Target frame id to finalize.')
}).describe('finalize input');

const SerializeInput = z.object({
  sessionId: z.string().describe('Target session id to serialize into a textual, self-contained proof script.')
}).describe('serialize input');

const ListFramesInput = z.object({ sessionId: z.string().describe('Target session id.') }).describe('list_frames input');
const GetFrameInput = z.object({ sessionId: z.string().describe('Target session id.'), frameId: z.string().describe('Frame id to query.') }).describe('get_frame input');
const GetGlobalInput = z.object({ sessionId: z.string().describe('Target session id.') }).describe('get_global input');
const ShutdownInput = z.object({ confirm: z.literal(true).describe('Must be `true` to confirm server shutdown to avoid accidental exits.') }).describe('shutdown input');

// -----------------------------
// Server implementation
// -----------------------------

export async function startMcpServer(opts: { name?: string; version?: string } = {}) {
  const server = new McpServer({ name: opts.name ?? "proofsession-mcp", version: opts.version ?? "0.1.0" });
  const transport = new StdioServerTransport();

  // in-memory sessions map
  const sessions = new Map<string, { id: string; sess: any; createdAt: number }>();
  let idx = 0;
  function nextId() { return `sess_${++idx}`; }

  // Create helper for robust textual responses used by many tools
  function textContent(s: string) { return { content: [{ type: 'text', text: String(s) }] }; }

  // Register tools with extremely detailed descriptions (for LLMs)

  server.registerTool(
    "create_session",
    {
      title: "Create ProofSession",
      description: "Create a new ProofSession. Returns a `sessionId` string.

PARAMS:
- `initialFacts` (optional): an array of named facts to seed as the session global context. Each fact must be { name: string, fact: { kind: 'eq'|'neq', lhs: Expr, rhs: Expr } }.
- `rules` (optional): a map from rule name to { lhs: Expr, rhs: Expr } for named rewrite rules.

BEHAVIOR:
- The created session will be empty unless `initialFacts` are provided.
- The server will validate the shapes of `initialFacts` and `rules` against the provided schemas and return an error on mismatch.",
      inputSchema: CreateSessionInput
    },
    async ({ initialFacts, rules }) => {
      const id = nextId();
      const sess = new ProofSession(initialFacts || [], rules || undefined);
      sess.setLogger((m: string) => server.emitEvent('notifications/log', { sessionId: id, message: String(m), ts: Date.now() }));
      sessions.set(id, { id, sess, createdAt: Date.now() });
      // Return a machine-friendly JSON string inside a text content block for clients that expect tool outputs
      return textContent(JSON.stringify({ sessionId: id }));
    }
  );

  server.registerTool(
    "seed_global",
    {
      title: "Seed Global Context",
      description: "Seed named facts into an existing session's global context.

PARAMS:
- `sessionId`: the target session id returned from create_session.
- `initialFacts`: an array of objects { name: string, fact: Fact } where Fact follows the FactSchema.
- `overwrite` (optional): boolean. If true, facts with the same name will be overwritten. Default false.

BEHAVIOR:
- Validates schema and returns `{ ok: boolean, message?: string }` in the tool output as JSON.",
      inputSchema: SeedGlobalInput
    },
    async ({ sessionId, initialFacts, overwrite = false }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ ok: false, message: 'session not found' }));
      const res = rec.sess.seedGlobalContext(initialFacts || [], overwrite);
      server.emitEvent('notifications/resources/list_changed', { sessionId });
      return textContent(JSON.stringify(res));
    }
  );

  server.registerTool(
    "start_have",
    {
      title: "Start Have (open proof frame)",
      description: "Create a new proof frame inside the session for proving a goal fact.

PARAMS:
- `sessionId`: session to use.
- `name`: the name the proven fact will have if the frame is finalized.
- `goal`: a Fact object (kind=eq|neq).
- `parentFrameId` (optional): id of a parent frame to nest under.

RETURNS: `{ frameId }` in JSON text block. If a frame with the same name exists in the given parent context, the start may still succeed but finalization will fail due to name collision.",
      inputSchema: StartHaveInput
    },
    async ({ sessionId, name, goal, parentFrameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ error: 'session not found' }));
      try {
        const frameId = rec.sess.startHave(name, goal, parentFrameId);
        server.emitEvent('frames/started', { sessionId, frameId, name });
        return textContent(JSON.stringify({ frameId }));
      } catch (e) {
        return textContent(JSON.stringify({ error: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "add_command",
    {
      title: "Add Command to Frame",
      description: "Execute a command inside an open proof frame.

PARAMS:
- `sessionId`: session id.
- `frameId`: target frame id returned by start_have.
- `cmd`: a Command object matching the documented CommandSchema (one of: 多能, 不利, 反证, 再写, 重反, 确定).

RETURNS: `{ ok: boolean, message?: string }` describing success.

IMPORTANT: Commands are validated against the shapes defined in the CommandSchema; produce `cmd` objects that conform to those shapes.",
      inputSchema: AddCommandInput
    },
    async ({ sessionId, frameId, cmd }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ ok: false, message: 'session not found' }));
      try {
        const res = rec.sess.addCommand(frameId, cmd);
        server.emitEvent('frames/command_applied', { sessionId, frameId, cmd: { type: cmd?.cmd, meta: res } });
        return textContent(JSON.stringify(res));
      } catch (e) {
        return textContent(JSON.stringify({ ok: false, message: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "finalize",
    {
      title: "Finalize Frame",
      description: "Finalize an open proof frame. If the frame's goal is proven, the fact named by the frame will be added to the parent frame or global context.

PARAMS:
- `sessionId`: target session id.
- `frameId`: id of the frame to finalize.

RETURNS: `{ ok: boolean, message?: string }`. If `ok` is false the `message` will explain why (e.g. goal not yet proved).",
      inputSchema: FinalizeInput
    },
    async ({ sessionId, frameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ ok: false, message: 'session not found' }));
      try {
        const res = rec.sess.finalize(frameId);
        if (res && (res as any).ok) server.emitEvent('frames/finalized', { sessionId, frameId });
        return textContent(JSON.stringify(res));
      } catch (e) {
        return textContent(JSON.stringify({ ok: false, message: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "serialize",
    {
      title: "Serialize Session to Proof Script",
      description: "Serialize a session's chronological command history into a self-contained textual proof script.

PARAMS:
- `sessionId`: session to serialize.

RETURNS: A tool output content block whose text is the serialized proof script. The script includes seeded facts, `有` blocks for frames (commented if incomplete), and in-order commands. This output is safe to save and replay using the SDK or by constructing an appropriate client.",
      inputSchema: SerializeInput
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ error: 'session not found' }));
      try {
        const serialized = rec.sess.serializeAll();
        return { content: [{ type: 'text', text: serialized }] };
      } catch (e) {
        return textContent(JSON.stringify({ error: (e as Error).message }));
      }
    }
  );

  server.registerTool(
    "list_frames",
    {
      title: "List Frame IDs",
      description: "Return a list of known frame ids for a session.

PARAMS:
- `sessionId`

RETURNS: `{ frames: string[] }`.",
      inputSchema: ListFramesInput
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ error: 'session not found' }));
      try {
        const frames = rec.sess.listFrames();
        return textContent(JSON.stringify({ frames }));
      } catch (e) { return textContent(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "get_frame",
    {
      title: "Get Frame State",
      description: "Return the full FrameState object for an open or closed frame.

PARAMS:
- `sessionId`
- `frameId`

RETURNS: `{ frame: FrameState | null }` where FrameState includes id,name,goal,context.commands,completed, parentFrameId.

NOTE: The returned `context` is a snapshot object; its internal structure mirrors the Context class used by the prover.",
      inputSchema: GetFrameInput
    },
    async ({ sessionId, frameId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ error: 'session not found' }));
      try {
        const frame = rec.sess.getFrameState(frameId);
        return textContent(JSON.stringify({ frame }));
      } catch (e) { return textContent(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "get_global",
    {
      title: "Get Global Context",
      description: "Return the global context keys and (if available) the fact objects. This is helpful for clients that wish to inspect seeded facts.

PARAMS:
- `sessionId`

RETURNS: `{ keys: string[], facts: Record<string, Fact | null> }`.",
      inputSchema: GetGlobalInput
    },
    async ({ sessionId }) => {
      const rec = sessions.get(sessionId);
      if (!rec) return textContent(JSON.stringify({ error: 'session not found' }));
      try {
        const keys = rec.sess.getGlobalContextKeys();
        const sessAny = rec.sess as any;
        const facts: Record<string, any> = {};
        if (sessAny && sessAny.globalContext && typeof sessAny.globalContext.getFact === 'function') {
          for (const k of keys) facts[k] = sessAny.globalContext.getFact(k);
        }
        return textContent(JSON.stringify({ keys, facts }));
      } catch (e) { return textContent(JSON.stringify({ error: (e as Error).message })); }
    }
  );

  server.registerTool(
    "shutdown",
    {
      title: "Shutdown MCP Server (local use only)",
      description: "Gracefully shutdown the local MCP server. This tool requires an explicit `confirm: true` boolean to avoid accidental shutdowns. For production deployments do NOT expose this tool to untrusted clients.",
      inputSchema: ShutdownInput
    },
    async ({ confirm }) => {
      if (confirm !== true) return textContent(JSON.stringify({ ok: false, message: 'must confirm with true' }));
      // small delay so client can receive reply
      setTimeout(() => process.exit(0), 20);
      return textContent(JSON.stringify({ ok: true }));
    }
  );

  // Start transport and emit server-ready event
  await server.connect(transport);
  server.emitEvent('server/ready', { ts: Date.now(), name: opts.name ?? 'proofsession-mcp' });

  // graceful shutdown hooks
  process.on('SIGINT', () => {
    server.emitEvent('server/shutdown', { ts: Date.now() });
    process.exit(0);
  });

  return { server, transport, sessions };
}

// If executed directly, start the server
if (require.main === module) {
  (async () => {
    try {
      await startMcpServer();
      // Note: We avoid console.log because MCP uses stdio transport for messages.
    } catch (e) {
      console.error('Failed to start MCP server (SDK):', e);
      process.exit(1);
    }
  })();
}

export default startMcpServer;
