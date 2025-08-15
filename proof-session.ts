import { Prover, Context, Expr, DEFAULT_REWRITE_RULES, factToReadable, exprToReadableString, deepClone } from './prover-core.js';
import type { Fact, Command } from "./prover-core.js";

type State = { goal: Fact; context: Context; explicitCompletion: boolean };

interface ExecutedCommand {
  command: Command;
  timestamp: number;
  success: boolean;
}

export interface ProofSessionOptions {
  hypotheses?: Record<string, Fact>;
  logger?: (message: string) => void;
}

export class ProofSession {
  private state: State;
  private originalGoal: Fact;
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
    this.originalGoal = deepClone(goal);
    
    // Initialize prover with custom rewrite rules if provided
    const rules = DEFAULT_REWRITE_RULES;
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

  public getOriginalGoal() { return deepClone(this.originalGoal); }

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
    const provenGoal = childSession.getOriginalGoal();
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
}

export default ProofSession;
