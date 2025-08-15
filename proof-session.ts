import { Prover, Context, Expr, DEFAULT_REWRITE_RULES, factToReadable, exprToReadableString } from './prover-core.js';
import type { Fact, Command } from "./prover-core.js";

type State = { goal: Fact; context: Context; explicitCompletion: boolean };

interface ExecutedCommand {
  command: Command;
  timestamp: number;
  success: boolean;
}

export interface ProofSessionOptions {
  hypotheses?: Record<string, Fact>;
  rewriteRules?: Record<string, { lhs: Expr; rhs: Expr }>;
  logger?: (message: string) => void;
}

export class ProofSession {
  private state: State;
  private prover: Prover;
  private parent: ProofSession | null;
  private children: Set<ProofSession>;
  private sessionId: string;
  private logger: (message: string) => void;
  private executedCommands: ExecutedCommand[];
  private childProofs: Map<ProofSession, string>; // child session -> fact name
  private static sessionCounter = 0;

  constructor(
    goal: Fact, 
    options: ProofSessionOptions = {}, 
    parent: ProofSession | null = null
  ) {
    this.sessionId = `session_${++ProofSession.sessionCounter}`;
    this.parent = parent;
    this.children = new Set();
    this.executedCommands = [];
    this.childProofs = new Map();
    this.logger = options.logger || (() => {});
    
    // Initialize prover with custom rewrite rules if provided
    const rules = options.rewriteRules || DEFAULT_REWRITE_RULES;
    this.prover = new Prover(rules);
    this.prover.setLogger(this.logger);
    
    // Initialize context with hypotheses
    const context = new Context();
    if (options.hypotheses) {
      for (const [name, fact] of Object.entries(options.hypotheses)) {
        context.addFact(name, fact);
        this.logger(`Added hypothesis '${name}': ${factToReadable(fact)}`);
      }
    }
    
    // Initialize state
    this.state = {
      goal: goal,
      context: context,
      explicitCompletion: false
    };
    
    this.logger(`Created ${this.sessionId} with goal: ${factToReadable(goal)}`);
    
    // Register with parent
    if (this.parent) {
      this.parent.children.add(this);
    }
  }

  /**
   * Execute a single command in this session
   */
  runCommand(cmd: Command): boolean {
    if (this.state.explicitCompletion) {
      this.logger(`Session ${this.sessionId} is already complete`);
      return false;
    }

    this.logger(`Executing command in ${this.sessionId}: ${JSON.stringify(cmd)}`);
    const success = this.prover.runCommand(this.state, cmd);
    
    // Track the executed command
    this.executedCommands.push({
      command: cmd,
      timestamp: Date.now(),
      success: success
    });
    
    if (success) {
      // Check if goal is now proved
      if (this.prover.checkGoalProved(this.state)) {
        this.logger(`Goal proved in ${this.sessionId}!`);
      }
    }
    
    return success;
  }

  /**
   * Start a nested proof session to prove a sub-goal
   */
  startNestedProof(
    goal: Fact, 
    options: ProofSessionOptions = {}
  ): ProofSession {
    // Inherit hypotheses from current context unless overridden
    const inheritedHypotheses: Record<string, Fact> = {};
    for (const factName of this.state.context.keys()) {
      const fact = this.state.context.getFact(factName);
      if (fact) {
        inheritedHypotheses[factName] = fact;
      }
    }
    
    const mergedOptions: ProofSessionOptions = {
      hypotheses: { ...inheritedHypotheses, ...(options.hypotheses || {}) },
      rewriteRules: options.rewriteRules || this.prover.rewriteRules,
      logger: options.logger || this.logger
    };
    
    const childSession = new ProofSession(goal, mergedOptions, this);
    this.logger(`Started nested proof ${childSession.sessionId} from ${this.sessionId}`);
    
    return childSession;
  }

  /**
   * Finalize a completed nested proof and add its result to this session's context
   */
  finalizeNestedProof(childSession: ProofSession, factName: string): boolean {
    if (!this.children.has(childSession)) {
      this.logger(`Error: ${childSession.sessionId} is not a child of ${this.sessionId}`);
      return false;
    }
    
    if (!childSession.isComplete()) {
      this.logger(`Error: Child session ${childSession.sessionId} is not complete`);
      return false;
    }
    
    if (this.state.context.has(factName)) {
      this.logger(`Error: Fact name '${factName}' already exists in context`);
      return false;
    }
    
    // Add the proven goal as a fact in this session's context
    const provenGoal = childSession.getGoal();
    this.state.context.addFact(factName, provenGoal);
    
    // Track the child proof
    this.childProofs.set(childSession, factName);
    
    // Remove child from active children
    this.children.delete(childSession);
    
    this.logger(`Finalized nested proof: added '${factName}': ${factToReadable(provenGoal)}`);
    return true;
  }

  /**
   * Check if this session's goal has been proved
   */
  isComplete(): boolean {
    return this.prover.checkGoalProved(this.state);
  }

  /**
   * Get the current goal of this session
   */
  getGoal(): Fact {
    return this.state.goal;
  }

  /**
   * Get a copy of the current context
   */
  getContext(): Context {
    return this.state.context.clone();
  }

  /**
   * Get all facts currently in the context
   */
  getHypotheses(): Record<string, Fact> {
    const hypotheses: Record<string, Fact> = {};
    for (const factName of this.state.context.keys()) {
      const fact = this.state.context.getFact(factName);
      if (fact) {
        hypotheses[factName] = fact;
      }
    }
    return hypotheses;
  }

  /**
   * Get a specific fact from the context
   */
  getFact(name: string): Fact | undefined {
    return this.state.context.getFact(name);
  }

  /**
   * Check if a fact exists in the context
   */
  hasFact(name: string): boolean {
    return this.state.context.has(name);
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the parent session (null if this is the root session)
   */
  getParent(): ProofSession | null {
    return this.parent;
  }

  /**
   * Get all active child sessions
   */
  getChildren(): ProofSession[] {
    return Array.from(this.children);
  }

  /**
   * Check if this session has any active child sessions
   */
  hasActiveChildren(): boolean {
    return this.children.size > 0;
  }

  /**
   * Get the current state (mainly for debugging)
   */
  getState(): Readonly<State> {
    return {
      goal: this.state.goal,
      context: this.state.context.clone(),
      explicitCompletion: this.state.explicitCompletion
    };
  }

  /**
   * Get a summary of the session's current state
   */
  getSummary(): string {
    const lines = [
      `Session: ${this.sessionId}`,
      `Goal: ${factToReadable(this.state.goal)}`,
      `Complete: ${this.isComplete()}`,
      `Facts: ${this.state.context.keys().length}`,
      `Active children: ${this.children.size}`
    ];
    
    if (this.parent) {
      lines.push(`Parent: ${this.parent.sessionId}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Clean up completed child sessions
   */
  cleanupCompletedChildren(): number {
    let cleaned = 0;
    for (const child of this.children) {
      if (child.isComplete() && !child.hasActiveChildren()) {
        this.children.delete(child);
        cleaned++;
        this.logger(`Cleaned up completed child session ${child.sessionId}`);
      }
    }
    return cleaned;
  }

  // ========================
  // SERIALIZATION METHODS
  // ========================

  /**
   * Convert a Fact to Chinese theorem prover syntax
   */
  private factToChinese(fact: Fact): string {
    const lhsStr = this.exprToChinese(fact.lhs);
    const rhsStr = this.exprToChinese(fact.rhs);
    
    if (fact.kind === 'eq') {
      return `${lhsStr} = ${rhsStr}`;
    } else {
      return `${lhsStr} ≠ ${rhsStr}`;
    }
  }

  /**
   * Convert an Expr to Chinese theorem prover syntax
   */
  private exprToChinese(expr: Expr): string {
    switch (expr.type) {
      case 'var':
        return expr.name;
        
      case 'const':
        return String(expr.value);
        
      case 'op':
        switch (expr.op) {
          case 'add':
            return expr.args.map(a => this.exprToChinese(a)).join(' + ');
          case 'sub':
            return `(${this.exprToChinese(expr.args[0])} - ${this.exprToChinese(expr.args[1])})`;
          case 'mul':
            return expr.args.map(a => `${this.exprToChinese(a)}`).join(' * ');
          case 'div':
            return `${this.exprToChinese(expr.args[0])} / ${this.exprToChinese(expr.args[1])}`;
          case 'neg':
            return `-${this.exprToChinese(expr.args[0])}`;
          case 'pow':
            return `${this.exprToChinese(expr.args[0])} ^ ${this.exprToChinese(expr.args[1])}`;
        }
        break;
        
      case 'func':
        const args = expr.args.map(a => this.exprToChinese(a)).join(' ');
        return `${expr.name} ${args}`;
    }
    
    return exprToReadableString(expr);
  }

  /**
   * Convert a Command to Chinese theorem prover syntax
   */
  private commandToChinese(cmd: Command): string {
    switch (cmd.cmd) {
      case '多能':
        if (cmd.denomProofs && cmd.denomProofs.length > 0) {
          return `多能 [${cmd.denomProofs.join(', ')}]`;
        }
        return '多能';
        
      case '不利':
        // This should be handled as a nested 有 statement
        return `有 ${cmd.newName} : ${this.exprToChinese(cmd.component)} ≠ 0 是 不利 ${cmd.hypothesis}`;
        
      case '反证':
        return `反证 ${cmd.hypName}`;
        
      case '再写':
        if (cmd.occurrence) {
          return `再写 在 ${cmd.occurrence} ${cmd.equalityName}`;
        }
        return `再写 ${cmd.equalityName}`;
        
      case '重反':
        return `重反 ${cmd.oldName} 成 ${cmd.newName}`;
        
      case '确定':
        return '确定';
        
      default:
        return JSON.stringify(cmd);
    }
  }

  /**
   * Serialize this session to Chinese theorem prover syntax
   */
  serialize(factName?: string): string {
    const goalStr = this.factToChinese(this.state.goal);
    const name = factName || `goal_${this.sessionId}`;
    
    const proofLines = this.serializeProof(2); // Start with 2-space indent
    
    if (proofLines.length === 0) {
      return `有 ${name} : ${goalStr} 是\n  // 证明未完成`;
    }
    
    return `有 ${name} : ${goalStr} 是\n${proofLines.join('\n')}`;
  }

  /**
   * Serialize the proof part of this session
   */
  private serializeProof(indent: number): string[] {
    const lines: string[] = [];
    const indentStr = ' '.repeat(indent);
    
    // Process executed commands
    for (const execCmd of this.executedCommands) {
      if (!execCmd.success) {
        lines.push(`${indentStr}// 失败的命令: ${this.commandToChinese(execCmd.command)}`);
        continue;
      }
      
      const cmd = execCmd.command;
      
      // Handle 不利 commands specially (they create nested facts)
      if (cmd.cmd === '不利') {
        lines.push(`${indentStr}${this.commandToChinese(cmd)}`);
      } else {
        lines.push(`${indentStr}${this.commandToChinese(cmd)}`);
      }
    }
    
    // Add completed child proofs
    for (const [childSession, factName] of this.childProofs.entries()) {
      const childSerialization = childSession.serialize(factName);
      const childLines = childSerialization.split('\n');
      for (const line of childLines) {
        lines.push(`${indentStr}${line}`);
      }
    }
    
    // Add incomplete child sessions as comments
    for (const childSession of this.children) {
      if (!childSession.isComplete()) {
        const childGoal = this.factToChinese(childSession.getGoal());
        lines.push(`${indentStr}// 未完成的子证明:`);
        lines.push(`${indentStr}// 有 子目标 : ${childGoal} 是`);
        
        const childProofLines = childSession.serializeProof(indent + 4);
        for (const line of childProofLines) {
          lines.push(`${indentStr}// ${line.trim()}`);
        }
        
        if (childProofLines.length === 0) {
          lines.push(`${indentStr}//   // 无执行的命令`);
        }
      }
    }
    
    // If session is incomplete and no commands executed
    if (!this.isComplete() && this.executedCommands.length === 0 && this.children.size === 0) {
      lines.push(`${indentStr}// 证明未开始`);
    }
    
    return lines;
  }

  /**
   * Serialize the full session tree (including parent context if any)
   */
  serializeWithContext(): string {
    const lines: string[] = [];
    
    // Add context facts as comments
    const hypotheses = this.getHypotheses();
    if (Object.keys(hypotheses).length > 0) {
      lines.push('// 上下文:');
      for (const [name, fact] of Object.entries(hypotheses)) {
        // Don't include facts that were proven in child sessions
        let isChildProof = false;
        for (const childSession of this.childProofs.keys()) {
          if (this.childProofs.get(childSession) === name) {
            isChildProof = true;
            break;
          }
        }
        
        if (!isChildProof) {
          lines.push(`// ${name}: ${this.factToChinese(fact)}`);
        }
      }
      lines.push('');
    }
    
    // Add the main proof
    lines.push(this.serialize());
    
    return lines.join('\n');
  }

  /**
   * Get a summary of the serialization status
   */
  getSerializationSummary(): string {
    const totalCommands = this.executedCommands.length;
    const successfulCommands = this.executedCommands.filter(c => c.success).length;
    const completedChildren = this.childProofs.size;
    const incompleteChildren = this.children.size;
    
    return [
      `序列化摘要 - ${this.sessionId}:`,
      `目标: ${this.factToChinese(this.state.goal)}`,
      `已执行命令: ${successfulCommands}/${totalCommands}`,
      `已完成子证明: ${completedChildren}`,
      `未完成子证明: ${incompleteChildren}`,
      `证明状态: ${this.isComplete() ? '完成' : '进行中'}`
    ].join('\n');
  }
}

export default ProofSession;
