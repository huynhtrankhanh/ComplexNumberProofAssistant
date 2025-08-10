// mcp_server.ts
// MCP Server for the Chinese Theorem Prover
// Provides a comprehensive interface with detailed descriptions for LLMs

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ProofSession, Expr, Fact, Command, DEFAULT_REWRITE_RULES } from './main/index.js';

// Global state to manage proof sessions
const sessions = new Map<string, ProofSession>();
let sessionCounter = 0;

// Expression builder schemas with detailed descriptions
const ExprSchema = z.union([
  z.object({
    type: z.literal('var'),
    name: z.string().describe('Variable name like "x", "y", "a", "b", etc.')
  }).describe('A variable in a mathematical expression'),
  
  z.object({
    type: z.literal('const'),
    value: z.union([z.string(), z.number()]).describe('Numeric constant like 0, 1, -5, 3.14, or "i" for imaginary unit')
  }).describe('A constant value in a mathematical expression'),
  
  z.object({
    type: z.literal('op'),
    op: z.enum(['add', 'sub', 'mul', 'div', 'neg', 'pow']).describe('Mathematical operation: add (+), sub (-), mul (*), div (/), neg (unary -), pow (^)'),
    args: z.array(z.lazy(() => ExprSchema)).describe('Operand expressions. add/mul can have multiple args, sub/div/pow need exactly 2, neg needs 1')
  }).describe('A mathematical operation combining expressions'),
  
  z.object({
    type: z.literal('func'),
    name: z.string().describe('Function name like "conj" (complex conjugate), "Re" (real part), "Im" (imaginary part), "sqnorm" (squared norm)'),
    args: z.array(z.lazy(() => ExprSchema)).describe('Function arguments')
  }).describe('A mathematical function applied to expressions')
]).describe('A mathematical expression tree structure');

const FactSchema = z.union([
  z.object({
    kind: z.literal('eq'),
    lhs: ExprSchema.describe('Left-hand side of the equation'),
    rhs: ExprSchema.describe('Right-hand side of the equation')
  }).describe('An equality fact: lhs = rhs'),
  
  z.object({
    kind: z.literal('neq'),
    lhs: ExprSchema.describe('Left-hand side of the inequality'),
    rhs: ExprSchema.describe('Right-hand side of the inequality')
  }).describe('An inequality fact: lhs ≠ rhs')
]).describe('A mathematical fact that can be either an equality (=) or inequality (≠)');

// Create the MCP server
const server = new Server(
  {
    name: 'chinese-theorem-prover',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define all available tools with comprehensive descriptions
const TOOLS: Tool[] = [
  {
    name: 'create_session',
    description: `Create a new Chinese Theorem Prover session. This initializes a proof environment where you can:
- Add mathematical facts (equations and inequalities)
- Start proof frames to prove new facts from existing ones
- Use Chinese proof commands to manipulate expressions
- Build hierarchical proofs with nested frames

Example workflow:
1. Create a session
2. Add initial facts using add_fact
3. Start a proof frame with start_proof
4. Apply commands to transform the goal
5. Finalize the proof
6. Export the complete proof using serialize_proof

Returns a session_id to use with other commands.`,
    inputSchema: z.object({
      initial_facts: z.array(z.object({
        name: z.string().describe('Unique name for this fact, used to reference it later'),
        fact: FactSchema
      })).optional().describe('Optional initial facts to seed the proof context')
    }).describe('Configuration for the new proof session')
  },

  {
    name: 'add_fact',
    description: `Add a mathematical fact to the global context of a proof session. Facts are named assertions that can be:
- Equalities: "a = b" stating two expressions are equal
- Inequalities: "a ≠ b" stating two expressions are not equal

These facts can be referenced by name in proofs and commands.

Example facts:
- "h1": x + y = 5 (an equation)
- "h2": a * b ≠ 0 (product is non-zero)
- "conj_x": conj(x) = y (conjugate relation)`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID from create_session'),
      name: z.string().describe('Unique name for this fact (e.g., "h1", "axiom_1", "given")'),
      fact: FactSchema.describe('The mathematical fact to add'),
      overwrite: z.boolean().optional().describe('If true, overwrites existing fact with same name')
    })
  },

  {
    name: 'start_proof',
    description: `Start a new proof frame (有 yǒu - "have/establish"). This begins proving a new fact from existing facts.

A proof frame:
- Has a goal (the fact you want to prove)
- Inherits facts from parent context
- Can contain nested sub-proofs
- Must be finalized to add the proven fact to the context

The Chinese "有" means "to have" or "to establish" - you're establishing a new fact.

Example: To prove "x = 5" given "x + 1 = 6", you'd start a proof frame with goal "x = 5" and use commands to derive it.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      name: z.string().describe('Name for the fact being proved (will be added to context when finalized)'),
      goal: FactSchema.describe('The fact you want to prove'),
      parent_frame_id: z.string().optional().describe('Optional parent frame ID for nested proofs')
    })
  },

  {
    name: 'apply_buli',
    description: `Apply the 不利 (bùlì - "unfavorable/adverse") command. This proves a component is non-zero from a hypothesis.

Key uses:
1. If hypothesis states "a * b * c ≠ 0", you can prove "a ≠ 0", "b ≠ 0", or "c ≠ 0"
2. If hypothesis states "a / b ≠ 0", you can prove "a ≠ 0" or "b ≠ 0"
3. If hypothesis has form "expr ≠ value" and component appears in expr, proves "component ≠ value"

The name "不利" suggests proving something is "not beneficial" to being zero.

Example: Given "x * y / z ≠ 0", use 不利 to prove "y ≠ 0" or "z ≠ 0"`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID from start_proof'),
      new_name: z.string().describe('Name for the new inequality fact being created'),
      component: ExprSchema.describe('The component/subexpression to prove is non-zero'),
      hypothesis: z.string().describe('Name of existing inequality fact to derive from')
    })
  },

  {
    name: 'apply_duoneng',
    description: `Apply the 多能 (duōnéng - "versatile/capable") command. This uses algebraic simplification to prove equalities.

How it works:
- Simplifies both sides of the goal equation
- Checks if they're algebraically equivalent
- Requires proofs that denominators are non-zero

The name "多能" suggests this command is versatile in handling algebraic manipulations.

Example: To prove "(x+1)*(x-1) = x²-1", use 多能 for automatic algebraic simplification.

Note: You must provide proofs that any denominators in the expression are non-zero.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID'),
      denom_proofs: z.array(z.string()).optional().describe('Names of facts proving denominators ≠ 0')
    })
  },

  {
    name: 'apply_fanzheng',
    description: `Apply the 反证 (fǎnzhèng - "proof by contradiction") command. This swaps the goal with a hypothesis for contradiction proofs.

How it works:
- Current goal must be an inequality (a ≠ b)
- Named hypothesis must be an inequality (c ≠ d)
- Swaps them: hypothesis becomes equality (c = d), goal becomes equality (a = b)
- Prove the new goal to establish the original by contradiction

The name "反证" literally means "reverse proof" or "proof by contradiction".

Example: To prove "x ≠ 0" assuming "x² ≠ 1", use 反证 to swap them and prove "x² = 1" from "x = 0".`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID'),
      hypothesis_name: z.string().describe('Name of inequality hypothesis to swap with goal')
    })
  },

  {
    name: 'apply_rewrite',
    description: `Apply the 再写 (zàixiě - "rewrite") command. This substitutes expressions using equalities or rewrite rules.

How it works:
- Finds occurrences of one side of an equality in the goal
- Replaces with the other side
- Can use named equality facts or built-in rewrite rules

Built-in rules include:
- conj_inv: conj(conj(a)) = a
- conj_add: conj(a + b) = conj(a) + conj(b)
- conj_mul: conj(a * b) = conj(a) * conj(b)
- sqnorm_def: sqnorm(a) = a * conj(a)
- re_def: Re(a) = (a + conj(a)) / 2
- im_def: Im(a) = (a - conj(a)) / 2

The name "再写" means "write again" or "rewrite".

Example: Given "f = g + h", use 再写 to replace f with g + h in the goal.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID'),
      equality_name: z.string().describe('Name of equality fact or rewrite rule'),
      occurrence: z.number().optional().describe('Which occurrence to replace (1-indexed, default 1)')
    })
  },

  {
    name: 'apply_reverse',
    description: `Apply the 重反 (chóngfǎn - "reverse/flip") command. This creates a new equality with sides reversed.

How it works:
- Takes an existing equality fact "a = b"
- Creates a new fact "b = a"
- Useful for rewriting in different directions

The name "重反" suggests "heavily reversing" or "flipping over".

Example: Given fact "x + 1 = y", use 重反 to create "y = x + 1".`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID'),
      old_name: z.string().describe('Name of existing equality to reverse'),
      new_name: z.string().describe('Name for the new reversed equality')
    })
  },

  {
    name: 'apply_certain',
    description: `Apply the 确定 (quèdìng - "determine/confirm") command. This verifies equations with only constants.

How it works:
- Both sides of goal must be constant expressions
- Numerically evaluates and checks equality
- Handles complex numbers and standard operations

The name "确定" means "to make certain" or "to confirm".

Example: To prove "2 + 3 = 5" or "i * i = -1", use 确定.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID')
    })
  },

  {
    name: 'finalize_proof',
    description: `Finalize a proof frame, adding the proven fact to the context.

Requirements:
- The goal must be fully proven (equal to itself or matches existing fact)
- For equalities: sides must be identical or match a context fact
- For inequalities: must match an existing inequality fact

Once finalized:
- The proven fact is added to parent context with its given name
- The frame is marked complete
- Nested proofs must be finalized before parent proofs`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID to finalize')
    })
  },

  {
    name: 'get_frame_state',
    description: `Get the current state of a proof frame, including:
- Current goal (what you're trying to prove)
- Available facts in context
- Commands executed so far
- Whether the proof is complete

Useful for debugging and understanding proof progress.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID'),
      frame_id: z.string().describe('Frame ID')
    })
  },

  {
    name: 'serialize_proof',
    description: `Export the entire proof session as a formatted Chinese proof script.

Output format:
- Seeds required facts at the top
- Uses proper indentation for nested proofs
- Preserves exact command order
- Comments incomplete proofs
- Self-contained and replayable

The output uses Chinese command syntax:
- 有 name : fact 是 - establish a fact
- 多能 - algebraic simplification
- 不利 - prove non-zero
- 反证 - contradiction
- 再写 - rewrite
- 重反 - reverse equality
- 确定 - verify constants`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID')
    })
  },

  {
    name: 'list_facts',
    description: `List all available facts in the global context of a session.

Returns names and descriptions of all established facts that can be referenced in proofs.`,
    inputSchema: z.object({
      session_id: z.string().describe('Session ID')
    })
  },

  {
    name: 'list_rewrite_rules',
    description: `List all built-in rewrite rules available for the 再写 command.

These are predefined algebraic identities for complex numbers, conjugates, and related operations.`,
    inputSchema: z.object({})
  }
];

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handler for executing tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_session': {
        const sessionId = `session_${++sessionCounter}`;
        const { initial_facts } = args as any;
        
        const facts = initial_facts?.map((f: any) => ({
          name: f.name,
          fact: parseFact(f.fact)
        })) || [];
        
        const session = new ProofSession(facts, DEFAULT_REWRITE_RULES);
        sessions.set(sessionId, session);
        
        return {
          content: [
            {
              type: 'text',
              text: `Created proof session: ${sessionId}\nInitialized with ${facts.length} fact(s).`
            }
          ],
          data: { session_id: sessionId }
        };
      }

      case 'add_fact': {
        const { session_id, name, fact, overwrite } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const result = session.addGlobalFact(name, parseFact(fact), overwrite);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Added fact '${name}' to session context`
                : `Failed to add fact: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'start_proof': {
        const { session_id, name, goal, parent_frame_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const frameId = session.startHave(name, parseFact(goal), parent_frame_id);
        
        return {
          content: [
            {
              type: 'text',
              text: `Started proof frame '${name}' with ID: ${frameId}\nGoal: ${factToString(parseFact(goal))}`
            }
          ],
          data: { frame_id: frameId }
        };
      }

      case 'apply_buli': {
        const { session_id, frame_id, new_name, component, hypothesis } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '不利',
          newName: new_name,
          component: parseExpr(component),
          hypothesis
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 不利: proved '${new_name}' from '${hypothesis}'`
                : `不利 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'apply_duoneng': {
        const { session_id, frame_id, denom_proofs } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '多能',
          denomProofs: denom_proofs
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 多能: algebraic simplification succeeded`
                : `多能 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'apply_fanzheng': {
        const { session_id, frame_id, hypothesis_name } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '反证',
          hypName: hypothesis_name
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 反证: swapped goal with hypothesis '${hypothesis_name}'`
                : `反证 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'apply_rewrite': {
        const { session_id, frame_id, equality_name, occurrence } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '再写',
          equalityName: equality_name,
          occurrence
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 再写: rewrote using '${equality_name}'`
                : `再写 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'apply_reverse': {
        const { session_id, frame_id, old_name, new_name } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '重反',
          oldName: old_name,
          newName: new_name
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 重反: created reversed equality '${new_name}'`
                : `重反 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'apply_certain': {
        const { session_id, frame_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const cmd: Command = {
          cmd: '确定'
        };
        
        const result = session.addCommand(frame_id, cmd);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Applied 确定: constant evaluation succeeded`
                : `确定 failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'finalize_proof': {
        const { session_id, frame_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const result = session.finalize(frame_id);
        
        return {
          content: [
            {
              type: 'text',
              text: result.ok 
                ? `Finalized proof frame ${frame_id}`
                : `Finalization failed: ${result.message}`
            }
          ],
          data: result
        };
      }

      case 'get_frame_state': {
        const { session_id, frame_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const state = session.getFrameState(frame_id);
        if (!state) throw new Error(`Frame ${frame_id} not found`);
        
        return {
          content: [
            {
              type: 'text',
              text: `Frame: ${state.name} (${state.id})
Goal: ${factToString(state.goal)}
Context has ${state.context.keys().length} fact(s)
Commands executed: ${state.commands.length}
Completed: ${state.completed}`
            }
          ],
          data: state
        };
      }

      case 'serialize_proof': {
        const { session_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const serialized = session.serializeAll();
        
        return {
          content: [
            {
              type: 'text',
              text: `Serialized proof:\n\n${serialized}`
            }
          ],
          data: { proof_script: serialized }
        };
      }

      case 'list_facts': {
        const { session_id } = args as any;
        const session = sessions.get(session_id);
        if (!session) throw new Error(`Session ${session_id} not found`);
        
        const facts = session.getGlobalContextKeys();
        
        return {
          content: [
            {
              type: 'text',
              text: `Available facts in session:\n${facts.map(f => `- ${f}`).join('\n')}`
            }
          ],
          data: { facts }
        };
      }

      case 'list_rewrite_rules': {
        const rules = Object.entries(DEFAULT_REWRITE_RULES).map(([name, rule]) => 
          `${name}: ${exprToString(rule.lhs)} = ${exprToString(rule.rhs)}`
        );
        
        return {
          content: [
            {
              type: 'text',
              text: `Built-in rewrite rules:\n${rules.map(r => `- ${r}`).join('\n')}`
            }
          ],
          data: { rules: Object.keys(DEFAULT_REWRITE_RULES) }
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true,
    };
  }
});

// Helper functions to parse expressions and facts from JSON
function parseExpr(e: any): any {
  if (e.type === 'var') return Expr.var(e.name);
  if (e.type === 'const') return Expr.const(e.value);
  if (e.type === 'op') {
    const args = e.args.map(parseExpr);
    switch (e.op) {
      case 'add': return Expr.add(...args);
      case 'sub': return Expr.sub(args[0], args[1]);
      case 'mul': return Expr.mul(...args);
      case 'div': return Expr.div(args[0], args[1]);
      case 'neg': return Expr.neg(args[0]);
      case 'pow': return Expr.pow(args[0], args[1]);
      default: throw new Error(`Unknown op: ${e.op}`);
    }
  }
  if (e.type === 'func') {
    const args = e.args.map(parseExpr);
    return Expr.func(e.name, ...args);
  }
  throw new Error(`Unknown expression type: ${e.type}`);
}

function parseFact(f: any): Fact {
  const lhs = parseExpr(f.lhs);
  const rhs = parseExpr(f.rhs);
  return f.kind === 'eq' ? Expr.eq(lhs, rhs) : Expr.neq(lhs, rhs);
}

function exprToString(e: any): string {
  if (e.type === 'var') return e.name;
  if (e.type === 'const') return String(e.value);
  if (e.type === 'op') {
    if (e.op === 'add') return e.args.map(exprToString).join(' + ');
    if (e.op === 'sub') return `(${exprToString(e.args[0])} - ${exprToString(e.args[1])})`;
    if (e.op === 'mul') return e.args.map((a: any) => `(${exprToString(a)})`).join(' * ');
    if (e.op === 'div') return `(${exprToString(e.args[0])} / ${exprToString(e.args[1])})`;
    if (e.op === 'neg') return `(-${exprToString(e.args[0])})`;
    if (e.op === 'pow') return `(${exprToString(e.args[0])} ^ ${exprToString(e.args[1])})`;
  }
  if (e.type === 'func') {
    return `${e.name}(${e.args.map(exprToString).join(', ')})`;
  }
  return JSON.stringify(e);
}

function factToString(f: Fact): string {
  return f.kind === 'eq' 
    ? `${exprToString(f.lhs)} = ${exprToString(f.rhs)}`
    : `${exprToString(f.lhs)} ≠ ${exprToString(f.rhs)}`;
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Chinese Theorem Prover MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
