#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import ProofSession from './proof-session.js';
import { Expr } from './prover-core.js';
import type { Fact, Command } from './prover-core.js';

// Zod schemas for expression validation
const ExpressionSchema: z.ZodSchema<any> = z.lazy(() => z.union([
  z.object({
    type: z.literal('var'),
    name: z.string().min(1, 'Variable name cannot be empty')
  }),
  z.object({
    type: z.literal('const'),
    value: z.union([z.string(), z.number()])
  }),
  z.object({
    type: z.literal('op'),
    op: z.enum(['add', 'sub', 'mul', 'div', 'neg', 'pow']),
    args: z.array(ExpressionSchema).min(1, 'Operation must have at least one argument')
  }),
  z.object({
    type: z.literal('func'),
    name: z.enum(['conj', 'Re', 'Im', 'sqnorm']),
    args: z.array(ExpressionSchema).length(1, 'Functions must have exactly one argument')
  })
]));

const FactSchema = z.object({
  kind: z.enum(['eq', 'neq']),
  lhs: ExpressionSchema,
  rhs: ExpressionSchema
});

const CommandSchema = z.union([
  z.object({
    cmd: z.literal('多能'),
    denomProofs: z.array(z.string()).optional()
  }),
  z.object({
    cmd: z.literal('不利'),
    newName: z.string().min(1),
    component: ExpressionSchema,
    hypothesis: z.string().min(1)
  }),
  z.object({
    cmd: z.literal('反证'),
    hypName: z.string().min(1)
  }),
  z.object({
    cmd: z.literal('再写'),
    occurrence: z.number().int().min(1).optional(),
    equalityName: z.string().min(1)
  }),
  z.object({
    cmd: z.literal('重反'),
    oldName: z.string().min(1),
    newName: z.string().min(1)
  }),
  z.object({
    cmd: z.literal('确定')
  })
]);

const CreateSessionSchema = z.object({
  goal: FactSchema,
  hypotheses: z.record(z.string(), FactSchema).optional(),
  sessionName: z.string().optional()
});

const RunCommandSchema = z.object({
  command: CommandSchema,
  sessionId: z.string().optional()
});

const StartNestedProofSchema = z.object({
  goal: FactSchema,
  parentSessionId: z.string().optional()
});

const FinalizeNestedProofSchema = z.object({
  childSessionId: z.string(),
  factName: z.string().min(1),
  parentSessionId: z.string().optional()
});

const GetProofStateSchema = z.object({
  sessionId: z.string().optional()
});

const SwitchSessionSchema = z.object({
  sessionId: z.string()
});

// TypeScript types derived from Zod schemas
type Expression = z.infer<typeof ExpressionSchema>;
type FactType = z.infer<typeof FactSchema>;
type CommandType = z.infer<typeof CommandSchema>;
type CreateSessionArgs = z.infer<typeof CreateSessionSchema>;
type RunCommandArgs = z.infer<typeof RunCommandSchema>;
type StartNestedProofArgs = z.infer<typeof StartNestedProofSchema>;
type FinalizeNestedProofArgs = z.infer<typeof FinalizeNestedProofSchema>;
type GetProofStateArgs = z.infer<typeof GetProofStateSchema>;
type SwitchSessionArgs = z.infer<typeof SwitchSessionSchema>;

interface ProofState {
  sessionId: string;
  goal: string;
  isComplete: boolean;
  hypotheses: Record<string, string>;
  executedCommands: number;
  activeChildren: number;
  completedChildren: number;
  serializedProof: string;
  summary: string;
  parentSessionId?: string;
  childSessionIds: string[];
}

class ProofSessionServer {
  private sessions: Map<string, ProofSession> = new Map();
  private currentSessionId: string | null = null;
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'chinese-theorem-prover',
        version: '1.0.0',
        description: 'Interactive theorem prover for complex number mathematics using Chinese commands. Complete autonomous operation with all rules, strategies, and examples provided upfront.'
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_proof_session',
            description: `Create a new proof session with a goal and optional hypotheses.
            
COMPLETE REWRITE RULES AVAILABLE:
- conj_inv: conj(conj(a)) = a
- conj_add: conj(a + b) = conj(a) + conj(b)  
- conj_mul: conj(a * b) = conj(a) * conj(b)
- conj_sub: conj(a - b) = conj(a) - conj(b)
- conj_div: conj(a / b) = conj(a) / conj(b)
- conj_neg: conj(-a) = -conj(a)
- sqnorm_def: sqnorm(a) = a * conj(a)
- re_def: Re(a) = (a + conj(a)) / 2
- im_def: Im(a) = (a - conj(a)) / 2  
- i_square: i * i = -1

COMPLETE COMMAND REFERENCE:
- 多能: Prove using field axioms. Syntax: {"cmd":"多能","denomProofs":["fact1"]} (denomProofs required if goal has division)
- 不利: Derive component≠0 from expression≠0. Syntax: {"cmd":"不利","newName":"x_nz","component":{...},"hypothesis":"h1"}
- 反证: Proof by contradiction. Syntax: {"cmd":"反证","hypName":"h1"} (swaps goal with hypothesis, ≠ becomes =)
- 再写: Rewrite using rule/equality. Syntax: {"cmd":"再写","equalityName":"sqnorm_def","occurrence":1}
- 重反: Reverse equality. Syntax: {"cmd":"重反","oldName":"h1","newName":"h1_rev"}
- 确定: Prove constant equality. Syntax: {"cmd":"确定"}

PROOF STRATEGIES:
- sqnorm equality: (1) 再写 sqnorm_def twice (2) apply conjugate rules (3) 多能 with denominators
- Re(expr)=0: (1) 再写 re_def (2) recognize purely imaginary (3) geometric interpretation (4) 多能
- Inequality A≠B: (1) 反证 hypothesis or (2) 不利 from larger expression  
- General equality: (1) try 多能 first (2) 再写 definitions (3) apply rules (4) 多能 finish

NESTED PROOFS: Use start_nested_proof for sub-goals, finalize_nested_proof to add result as fact to parent.

EXPRESSION SYNTAX:
Variable: {"type":"var","name":"x"}
Constant: {"type":"const","value":0} or {"type":"const","value":"i"}
Add: {"type":"op","op":"add","args":[expr1,expr2,...]}
Subtract: {"type":"op","op":"sub","args":[expr1,expr2]}
Multiply: {"type":"op","op":"mul","args":[expr1,expr2,...]}
Divide: {"type":"op","op":"div","args":[numerator,denominator]}
Negate: {"type":"op","op":"neg","args":[expr]}
Power: {"type":"op","op":"pow","args":[base,exponent]}
Conjugate: {"type":"func","name":"conj","args":[expr]}
Real: {"type":"func","name":"Re","args":[expr]}
Imaginary: {"type":"func","name":"Im","args":[expr]}
Norm: {"type":"func","name":"sqnorm","args":[expr]}

EXAMPLES:
x: {"type":"var","name":"x"}
O-A: {"type":"op","op":"sub","args":[{"type":"var","name":"O"},{"type":"var","name":"A"}]}
(A+B)/2: {"type":"op","op":"div","args":[{"type":"op","op":"add","args":[{"type":"var","name":"A"},{"type":"var","name":"B"}]},{"type":"const","value":2}]}
sqnorm(O-A): {"type":"func","name":"sqnorm","args":[{"type":"op","op":"sub","args":[{"type":"var","name":"O"},{"type":"var","name":"A"}]}]}
Re((O-M)/(A-B)): {"type":"func","name":"Re","args":[{"type":"op","op":"div","args":[{"type":"op","op":"sub","args":[{"type":"var","name":"O"},{"type":"var","name":"M"}]},{"type":"op","op":"sub","args":[{"type":"var","name":"A"},{"type":"var","name":"B"}]}]}]}`,
            inputSchema: {
              type: 'object',
              properties: {
                goal: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['eq', 'neq'] },
                    lhs: { type: 'object' },
                    rhs: { type: 'object' }
                  },
                  required: ['kind', 'lhs', 'rhs']
                },
                hypotheses: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      kind: { type: 'string', enum: ['eq', 'neq'] },
                      lhs: { type: 'object' },
                      rhs: { type: 'object' }
                    },
                    required: ['kind', 'lhs', 'rhs']
                  }
                },
                sessionName: { type: 'string' }
              },
              required: ['goal']
            }
          },
          {
            name: 'run_command',
            description: `Execute a proof command. COMPLETE COMMAND DOCUMENTATION:

多能 (field axioms): Proves equalities true by commutativity, associativity, distributivity. 
- Syntax: {"cmd":"多能"} or {"cmd":"多能","denomProofs":["fact1","fact2"]}
- MUST provide denomProofs for any denominators in goal (except constants)
- Works on algebraic manipulations, not complex analysis

不利 (derive non-zero): From expr≠0, derive component≠0 (works on products, quotients, negations)
- Syntax: {"cmd":"不利","newName":"result_name","component":{expression},"hypothesis":"source_fact"}  
- Example: from (x*y)/z ≠ 0, derive y ≠ 0

反证 (contradiction): For proving A≠B, assume A=B and derive contradiction
- Syntax: {"cmd":"反证","hypName":"hypothesis_to_contradict"}
- Changes goal A≠B to new goal: prove what contradicts the hypothesis
- Automatically swaps ≠ to = and vice versa

再写 (rewrite): Transform goal using equality or rewrite rule
- Syntax: {"cmd":"再写","equalityName":"rule_or_fact_name","occurrence":1}
- equalityName can be: sqnorm_def, conj_add, conj_mul, conj_sub, conj_div, conj_neg, conj_inv, re_def, im_def, i_square, OR any fact name in context
- occurrence: which instance to rewrite (1-indexed, optional)
- Rules work bidirectionally automatically

重反 (reverse): Create A=B from B=A  
- Syntax: {"cmd":"重反","oldName":"existing_fact","newName":"new_fact_name"}

确定 (constants): Prove equalities of constant expressions
- Syntax: {"cmd":"确定"}
- Works on expressions like: conj(2)=2, sqnorm(1+i)=2, i*i=-1`,
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '多能' },
                        denomProofs: { type: 'array', items: { type: 'string' } }
                      },
                      required: ['cmd'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '不利' },
                        newName: { type: 'string', minLength: 1 },
                        component: { type: 'object' },
                        hypothesis: { type: 'string', minLength: 1 }
                      },
                      required: ['cmd', 'newName', 'component', 'hypothesis'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '反证' },
                        hypName: { type: 'string', minLength: 1 }
                      },
                      required: ['cmd', 'hypName'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '再写' },
                        occurrence: { type: 'integer', minimum: 1 },
                        equalityName: { 
                          type: 'string',
                          minLength: 1,
                          description: 'Rule: conj_inv,conj_add,conj_mul,conj_sub,conj_div,conj_neg,sqnorm_def,re_def,im_def,i_square OR fact name from context'
                        }
                      },
                      required: ['cmd', 'equalityName'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '重反' },
                        oldName: { type: 'string', minLength: 1 },
                        newName: { type: 'string', minLength: 1 }
                      },
                      required: ['cmd', 'oldName', 'newName'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '确定' }
                      },
                      required: ['cmd'],
                      additionalProperties: false
                    }
                  ]
                },
                sessionId: { type: 'string' }
              },
              required: ['command']
            }
          },
          {
            name: 'start_nested_proof',
            description: 'Start nested proof for sub-goal. Inherits all parent context. Use for proving lemmas needed by main proof.',
            inputSchema: {
              type: 'object',
              properties: {
                goal: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['eq', 'neq'] },
                    lhs: { type: 'object' },
                    rhs: { type: 'object' }
                  },
                  required: ['kind', 'lhs', 'rhs']
                },
                parentSessionId: { type: 'string' }
              },
              required: ['goal']
            }
          },
          {
            name: 'finalize_nested_proof',
            description: 'Complete nested proof and add result as named fact to parent context.',
            inputSchema: {
              type: 'object',
              properties: {
                childSessionId: { type: 'string', minLength: 1 },
                factName: { type: 'string', minLength: 1 },
                parentSessionId: { type: 'string' }
              },
              required: ['childSessionId', 'factName']
            }
          },
          {
            name: 'get_proof_state',
            description: 'Get complete current proof state including goal, hypotheses, progress, and serialized Chinese syntax.',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' }
              }
            }
          },
          {
            name: 'list_sessions',
            description: 'List all active proof sessions.',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'switch_session',
            description: 'Switch to different proof session.',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', minLength: 1 }
              },
              required: ['sessionId']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'create_proof_session':
            return await this.handleCreateSession(request.params.arguments);
          case 'run_command':
            return await this.handleRunCommand(request.params.arguments);
          case 'start_nested_proof':
            return await this.handleStartNestedProof(request.params.arguments);
          case 'finalize_nested_proof':
            return await this.handleFinalizeNestedProof(request.params.arguments);
          case 'get_proof_state':
            return await this.handleGetProofState(request.params.arguments);
          case 'list_sessions':
            return await this.handleListSessions(request.params.arguments);
          case 'switch_session':
            return await this.handleSwitchSession(request.params.arguments);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    });
  }

  private async handleCreateSession(args: unknown) {
    const parsed = CreateSessionSchema.parse(args);
    
    const goalFact = this.convertToFact(parsed.goal);
    const hypothesesFacts: Record<string, Fact> = {};
    
    if (parsed.hypotheses) {
      for (const [name, fact] of Object.entries(parsed.hypotheses)) {
        hypothesesFacts[name] = this.convertToFact(fact);
      }
    }
    
    const session = new ProofSession(goalFact, {
      hypotheses: hypothesesFacts,
      logger: (msg) => console.error(`[${session.getSessionId()}] ${msg}`)
    });
    
    this.sessions.set(session.getSessionId(), session);
    this.currentSessionId = session.getSessionId();
    
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Created new proof session: ${session.getSessionId()}`,
            sessionId: session.getSessionId(),
            currentSession: this.currentSessionId,
            state: state
          }, null, 2)
        }
      ]
    };
  }

  private async handleRunCommand(args: unknown) {
    const parsed = RunCommandSchema.parse(args);
    const targetSessionId = parsed.sessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      throw new Error('No active session. Create a session first.');
    }
    
    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session not found: ${targetSessionId}`);
    }
    
    const cmd = this.convertToCommand(parsed.command);
    const success = session.runCommand(cmd);
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: success,
            message: success ? 'Command executed successfully' : 'Command failed',
            command: parsed.command,
            sessionId: targetSessionId,
            state: state
          }, null, 2)
        }
      ]
    };
  }

  private async handleStartNestedProof(args: unknown) {
    const parsed = StartNestedProofSchema.parse(args);
    const targetSessionId = parsed.parentSessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      throw new Error('No active session. Create a session first.');
    }
    
    const parentSession = this.sessions.get(targetSessionId);
    if (!parentSession) {
      throw new Error(`Parent session not found: ${targetSessionId}`);
    }
    
    const goalFact = this.convertToFact(parsed.goal);
    const childSession = parentSession.startNestedProof(goalFact);
    
    this.sessions.set(childSession.getSessionId(), childSession);
    this.currentSessionId = childSession.getSessionId();
    
    const parentState = this.getSessionState(parentSession);
    const childState = this.getSessionState(childSession);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Started nested proof session: ${childSession.getSessionId()}`,
            parentSessionId: targetSessionId,
            childSessionId: childSession.getSessionId(),
            currentSession: this.currentSessionId,
            parentState: parentState,
            childState: childState
          }, null, 2)
        }
      ]
    };
  }

  private async handleFinalizeNestedProof(args: unknown) {
    const parsed = FinalizeNestedProofSchema.parse(args);
    const targetParentId = parsed.parentSessionId || this.currentSessionId;
    
    if (!targetParentId) {
      throw new Error('No active parent session.');
    }
    
    const parentSession = this.sessions.get(targetParentId);
    const childSession = this.sessions.get(parsed.childSessionId);
    
    if (!parentSession) {
      throw new Error(`Parent session not found: ${targetParentId}`);
    }
    if (!childSession) {
      throw new Error(`Child session not found: ${parsed.childSessionId}`);
    }
    
    const success = parentSession.finalizeNestedProof(childSession, parsed.factName);
    this.currentSessionId = targetParentId;
    
    const parentState = this.getSessionState(parentSession);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: success,
            message: success ? 
              `Finalized nested proof: ${parsed.factName}` : 
              'Failed to finalize nested proof',
            parentSessionId: targetParentId,
            childSessionId: parsed.childSessionId,
            factName: parsed.factName,
            currentSession: this.currentSessionId,
            state: parentState
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetProofState(args: unknown) {
    const parsed = GetProofStateSchema.parse(args);
    const targetSessionId = parsed.sessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      throw new Error('No active session.');
    }
    
    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session not found: ${targetSessionId}`);
    }
    
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId: targetSessionId,
            currentSession: this.currentSessionId,
            state: state
          }, null, 2)
        }
      ]
    };
  }

  private async handleListSessions(args: unknown) {
    // No validation needed for empty object
    const sessionsList = Array.from(this.sessions.entries()).map(([id, session]) => ({
      sessionId: id,
      goal: this.factToString(session.getGoal()),
      isComplete: session.isComplete(),
      isCurrent: id === this.currentSessionId,
      hasParent: !!session.getParent(),
      childrenCount: session.getChildren().length
    }));
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            currentSession: this.currentSessionId,
            totalSessions: this.sessions.size,
            sessions: sessionsList
          }, null, 2)
        }
      ]
    };
  }

  private async handleSwitchSession(args: unknown) {
    const parsed = SwitchSessionSchema.parse(args);
    
    if (!this.sessions.has(parsed.sessionId)) {
      throw new Error(`Session not found: ${parsed.sessionId}`);
    }
    
    const oldSessionId = this.currentSessionId;
    this.currentSessionId = parsed.sessionId;
    
    const session = this.sessions.get(parsed.sessionId)!;
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Switched to session: ${parsed.sessionId}`,
            previousSession: oldSessionId,
            currentSession: this.currentSessionId,
            state: state
          }, null, 2)
        }
      ]
    };
  }

  private getSessionState(session: ProofSession): ProofState {
    const hypotheses = session.getHypotheses();
    const hypothesesStrings: Record<string, string> = {};
    
    for (const [name, fact] of Object.entries(hypotheses)) {
      hypothesesStrings[name] = this.factToString(fact);
    }
    
    return {
      sessionId: session.getSessionId(),
      goal: this.factToString(session.getGoal()),
      isComplete: session.isComplete(),
      hypotheses: hypothesesStrings,
      executedCommands: session.getState().context.keys().length,
      activeChildren: session.getChildren().length,
      completedChildren: 0,
      serializedProof: session.serializeWithContext(),
      summary: session.getSummary(),
      parentSessionId: session.getParent()?.getSessionId(),
      childSessionIds: session.getChildren().map(child => child.getSessionId())
    };
  }

  private convertToFact(factData: FactType): Fact {
    return {
      kind: factData.kind,
      lhs: this.convertToExpr(factData.lhs),
      rhs: this.convertToExpr(factData.rhs)
    };
  }

  private convertToExpr(exprData: Expression): any {
    const validated = ExpressionSchema.parse(exprData);
    
    switch (validated.type) {
      case 'var':
        return validated;
      case 'const':
        return validated;
      case 'op':
        return {
          ...validated,
          args: validated.args.map(arg => this.convertToExpr(arg))
        };
      case 'func':
        return {
          ...validated,
          args: validated.args.map(arg => this.convertToExpr(arg))
        };
      default:
        throw new Error(`Unknown expression type: ${(validated as any).type}`);
    }
  }

  private convertToCommand(commandData: CommandType): Command {
    return commandData as Command;
  }

  private factToString(fact: Fact): string {
    const op = fact.kind === 'eq' ? '=' : '≠';
    return `${this.exprToString(fact.lhs)} ${op} ${this.exprToString(fact.rhs)}`;
  }

  private exprToString(expr: any): string {
    if (expr.type === 'var') return expr.name;
    if (expr.type === 'const') return String(expr.value);
    if (expr.type === 'op') {
      const opMap: Record<string, string> = {
        add: '+', sub: '-', mul: '*', div: '/', neg: '-', pow: '^'
      };
      if (expr.op === 'neg') return `-${this.exprToString(expr.args[0])}`;
      if (expr.args.length === 2) {
        return `(${this.exprToString(expr.args[0])} ${opMap[expr.op]} ${this.exprToString(expr.args[1])})`;
      }
      return expr.args.map((a: any) => this.exprToString(a)).join(` ${opMap[expr.op]} `);
    }
    if (expr.type === 'func') {
      return `${expr.name}(${expr.args.map((a: any) => this.exprToString(a)).join(', ')})`;
    }
    return JSON.stringify(expr);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chinese Theorem Prover MCP Server running on stdio');
  }
}

const server = new ProofSessionServer();
server.run().catch(console.error);

export default ProofSessionServer;
