#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import ProofSession from './proof-session.js';
import { Expr } from './prover-core.js';
import type { Fact, Command } from './prover-core.js';

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
        definitions: {
          expression: {
            type: 'object',
            description: 'Mathematical expression in the Chinese theorem prover',
            oneOf: [
              {
                description: 'Variable expression',
                type: 'object',
                properties: {
                  type: { const: 'var' },
                  name: { type: 'string', description: 'Variable name (e.g., "x", "A", "O", "M", "i")' }
                },
                required: ['type', 'name'],
                additionalProperties: false
              },
              {
                description: 'Constant expression',
                type: 'object',
                properties: {
                  type: { const: 'const' },
                  value: { 
                    oneOf: [{ type: 'string' }, { type: 'number' }],
                    description: 'Constant value (e.g., 0, 1, 2, -1, "i")' 
                  }
                },
                required: ['type', 'value'],
                additionalProperties: false
              },
              {
                description: 'Operation expression',
                type: 'object',
                properties: {
                  type: { const: 'op' },
                  op: { 
                    type: 'string',
                    enum: ['add', 'sub', 'mul', 'div', 'neg', 'pow'],
                    description: 'add: a+b+c (multiple args), sub: a-b (2 args), mul: a*b*c (multiple args), div: a/b (2 args), neg: -a (1 arg), pow: a^b (2 args)'
                  },
                  args: {
                    type: 'array',
                    description: 'Arguments to the operation',
                    items: { $ref: '#/definitions/expression' },
                    minItems: 1
                  }
                },
                required: ['type', 'op', 'args'],
                additionalProperties: false
              },
              {
                description: 'Function call expression',
                type: 'object',
                properties: {
                  type: { const: 'func' },
                  name: { 
                    type: 'string',
                    enum: ['conj', 'Re', 'Im', 'sqnorm'],
                    description: 'conj: complex conjugate, Re: real part, Im: imaginary part, sqnorm: squared norm |z|²'
                  },
                  args: {
                    type: 'array',
                    description: 'Arguments to the function (exactly 1 argument for all functions)',
                    items: { $ref: '#/definitions/expression' },
                    minItems: 1,
                    maxItems: 1
                  }
                },
                required: ['type', 'name', 'args'],
                additionalProperties: false
              }
            ],
            examples: [
              { type: 'var', name: 'x' },
              { type: 'var', name: 'A' },
              { type: 'var', name: 'O' },
              { type: 'var', name: 'i' },
              { type: 'const', value: 0 },
              { type: 'const', value: 2 },
              { type: 'const', value: -1 },
              { type: 'op', op: 'add', args: [{ type: 'var', name: 'a' }, { type: 'var', name: 'b' }] },
              { type: 'op', op: 'sub', args: [{ type: 'var', name: 'O' }, { type: 'var', name: 'A' }] },
              { type: 'op', op: 'mul', args: [{ type: 'var', name: 'x' }, { type: 'var', name: 'y' }] },
              { type: 'op', op: 'div', args: [{ type: 'op', op: 'add', args: [{ type: 'var', name: 'A' }, { type: 'var', name: 'B' }] }, { type: 'const', value: 2 }] },
              { type: 'op', op: 'neg', args: [{ type: 'var', name: 'x' }] },
              { type: 'op', op: 'pow', args: [{ type: 'var', name: 'i' }, { type: 'const', value: 2 }] },
              { type: 'func', name: 'conj', args: [{ type: 'var', name: 'z' }] },
              { type: 'func', name: 'Re', args: [{ type: 'op', op: 'div', args: [{ type: 'op', op: 'sub', args: [{ type: 'var', name: 'O' }, { type: 'var', name: 'M' }] }, { type: 'op', op: 'sub', args: [{ type: 'var', name: 'A' }, { type: 'var', name: 'B' }] }] }] },
              { type: 'func', name: 'sqnorm', args: [{ type: 'op', op: 'sub', args: [{ type: 'var', name: 'O' }, { type: 'var', name: 'A' }] }] }
            ]
          },
          fact: {
            type: 'object',
            description: 'Mathematical fact (equality or inequality)',
            properties: {
              kind: {
                type: 'string',
                enum: ['eq', 'neq'],
                description: 'eq: equality (=), neq: inequality (≠)'
              },
              lhs: {
                description: 'Left hand side expression',
                $ref: '#/definitions/expression'
              },
              rhs: {
                description: 'Right hand side expression', 
                $ref: '#/definitions/expression'
              }
            },
            required: ['kind', 'lhs', 'rhs'],
            additionalProperties: false,
            examples: [
              { kind: 'eq', lhs: { type: 'var', name: 'x' }, rhs: { type: 'const', value: 0 } },
              { kind: 'neq', lhs: { type: 'var', name: 'A' }, rhs: { type: 'var', name: 'B' } },
              { kind: 'eq', lhs: { type: 'var', name: 'M' }, rhs: { type: 'op', op: 'div', args: [{ type: 'op', op: 'add', args: [{ type: 'var', name: 'A' }, { type: 'var', name: 'B' }] }, { type: 'const', value: 2 }] } },
              { kind: 'eq', lhs: { type: 'func', name: 'sqnorm', args: [{ type: 'op', op: 'sub', args: [{ type: 'var', name: 'O' }, { type: 'var', name: 'A' }] }] }, rhs: { type: 'func', name: 'sqnorm', args: [{ type: 'op', op: 'sub', args: [{ type: 'var', name: 'O' }, { type: 'var', name: 'B' }] }] } }
            ]
          }
        },
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

NESTED PROOFS: Use start_nested_proof for sub-goals, finalize_nested_proof to add result as fact to parent.`,
            inputSchema: {
              type: 'object',
              properties: {
                goal: { $ref: '#/definitions/fact' },
                hypotheses: {
                  type: 'object',
                  description: 'Initial hypotheses as name->fact mappings',
                  additionalProperties: { $ref: '#/definitions/fact' }
                },
                sessionName: {
                  type: 'string',
                  description: 'Optional name for the session'
                }
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
                  type: 'object',
                  description: 'The command to execute',
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '多能' },
                        denomProofs: { type: 'array', items: { type: 'string' }, description: 'Fact names proving denominators≠0' }
                      },
                      required: ['cmd'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '不利' },
                        newName: { type: 'string' },
                        component: { $ref: '#/definitions/expression' },
                        hypothesis: { type: 'string' }
                      },
                      required: ['cmd', 'newName', 'component', 'hypothesis'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '反证' },
                        hypName: { type: 'string' }
                      },
                      required: ['cmd', 'hypName'],
                      additionalProperties: false
                    },
                    {
                      type: 'object',
                      properties: {
                        cmd: { const: '再写' },
                        occurrence: { type: 'number', minimum: 1 },
                        equalityName: { 
                          type: 'string',
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
                        oldName: { type: 'string' },
                        newName: { type: 'string' }
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
                sessionId: { type: 'string', description: 'Optional session ID' }
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
                goal: { $ref: '#/definitions/fact' },
                parentSessionId: { type: 'string', description: 'Optional parent session ID' }
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
                childSessionId: { type: 'string' },
                factName: { type: 'string' },
                parentSessionId: { type: 'string', description: 'Optional parent session ID' }
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
                sessionId: { type: 'string', description: 'Optional session ID' }
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
                sessionId: { type: 'string' }
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

  private async handleCreateSession(args: any) {
    const { goal, hypotheses, sessionName } = args;
    
    const goalFact = this.objectToFact(goal);
    const hypothesesFacts: Record<string, Fact> = {};
    
    if (hypotheses) {
      for (const [name, fact] of Object.entries(hypotheses)) {
        hypothesesFacts[name] = this.objectToFact(fact as any);
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

  private async handleRunCommand(args: any) {
    const { command, sessionId } = args;
    const targetSessionId = sessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      throw new Error('No active session. Create a session first.');
    }
    
    const session = this.sessions.get(targetSessionId);
    if (!session) {
      throw new Error(`Session not found: ${targetSessionId}`);
    }
    
    const cmd = this.objectToCommand(command);
    const success = session.runCommand(cmd);
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: success,
            message: success ? 'Command executed successfully' : 'Command failed',
            command: command,
            sessionId: targetSessionId,
            state: state
          }, null, 2)
        }
      ]
    };
  }

  private async handleStartNestedProof(args: any) {
    const { goal, parentSessionId } = args;
    const targetSessionId = parentSessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      throw new Error('No active session. Create a session first.');
    }
    
    const parentSession = this.sessions.get(targetSessionId);
    if (!parentSession) {
      throw new Error(`Parent session not found: ${targetSessionId}`);
    }
    
    const goalFact = this.objectToFact(goal);
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

  private async handleFinalizeNestedProof(args: any) {
    const { childSessionId, factName, parentSessionId } = args;
    const targetParentId = parentSessionId || this.currentSessionId;
    
    if (!targetParentId) {
      throw new Error('No active parent session.');
    }
    
    const parentSession = this.sessions.get(targetParentId);
    const childSession = this.sessions.get(childSessionId);
    
    if (!parentSession) {
      throw new Error(`Parent session not found: ${targetParentId}`);
    }
    if (!childSession) {
      throw new Error(`Child session not found: ${childSessionId}`);
    }
    
    const success = parentSession.finalizeNestedProof(childSession, factName);
    this.currentSessionId = targetParentId;
    
    const parentState = this.getSessionState(parentSession);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: success,
            message: success ? 
              `Finalized nested proof: ${factName}` : 
              'Failed to finalize nested proof',
            parentSessionId: targetParentId,
            childSessionId: childSessionId,
            factName: factName,
            currentSession: this.currentSessionId,
            state: parentState
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetProofState(args: any) {
    const { sessionId } = args;
    const targetSessionId = sessionId || this.currentSessionId;
    
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

  private async handleListSessions(args: any) {
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

  private async handleSwitchSession(args: any) {
    const { sessionId } = args;
    
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const oldSessionId = this.currentSessionId;
    this.currentSessionId = sessionId;
    
    const session = this.sessions.get(sessionId)!;
    const state = this.getSessionState(session);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Switched to session: ${sessionId}`,
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

  private objectToFact(obj: any): Fact {
    return {
      kind: obj.kind,
      lhs: this.objectToExpr(obj.lhs),
      rhs: this.objectToExpr(obj.rhs)
    };
  }

  private objectToExpr(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Expression must be an object');
    }
    
    if (!obj.type) {
      throw new Error('Expression must have a type field');
    }
    
    switch (obj.type) {
      case 'var':
        if (!obj.name || typeof obj.name !== 'string') {
          throw new Error('Variable expression must have a name string');
        }
        break;
      case 'const':
        if (obj.value === undefined) {
          throw new Error('Constant expression must have a value');
        }
        break;
      case 'op':
        if (!obj.op || !['add', 'sub', 'mul', 'div', 'neg', 'pow'].includes(obj.op)) {
          throw new Error('Operation expression must have valid op field');
        }
        if (!Array.isArray(obj.args)) {
          throw new Error('Operation expression must have args array');
        }
        obj.args = obj.args.map((arg: any) => this.objectToExpr(arg));
        break;
      case 'func':
        if (!obj.name || !['conj', 'Re', 'Im', 'sqnorm'].includes(obj.name)) {
          throw new Error('Function expression must have valid name field');
        }
        if (!Array.isArray(obj.args)) {
          throw new Error('Function expression must have args array');
        }
        obj.args = obj.args.map((arg: any) => this.objectToExpr(arg));
        break;
      default:
        throw new Error(`Unknown expression type: ${obj.type}`);
    }
    
    return obj;
  }

  private objectToCommand(obj: any): Command {
    return obj as Command;
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