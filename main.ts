// chinese_theorem_prover.ts
// TypeScript implementation of the Chinese Theorem Prover (no parser).
// Recent changes requested by user:
// - Full support for seeding contexts (both for individual Prover instances and for ProofSession global context).
// - API methods added: ProofSession.addGlobalFact, ProofSession.seedGlobalContext, Prover.seedContext.
// - startHave clones the seeded global context so frames immediately see seeded facts.
// - Updated Usage Example demonstrates seeding and using 反证 with a seeded hypothesis.

import * as math from 'mathjs';

////////////////////////
// AST Types
////////////////////////

export type Expr = VarNode | ConstNode | OpNode | FuncNode;
export interface VarNode { type: 'var'; name: string; }
export interface ConstNode { type: 'const'; value: string | number; }
export interface OpNode { type: 'op'; op: 'add' | 'sub' | 'mul' | 'div' | 'neg' | 'pow'; args: Expr[]; }
export interface FuncNode { type: 'func'; name: string; args: Expr[]; }

export interface FactEq { kind: 'eq'; lhs: Expr; rhs: Expr; }
export interface FactNeq { kind: 'neq'; lhs: Expr; rhs: Expr; }
export type Fact = FactEq | FactNeq;

////////////////////////
// Commands
////////////////////////
export type Command = CmdDuoneng | CmdBuli | CmdFanzheng | CmdRewrite | CmdReverse | CmdCertain;
export interface CmdDuoneng { cmd: '多能'; denomProofs?: string[]; }
export interface CmdBuli { cmd: '不利'; newName: string; component: Expr; hypothesis: string; }
export interface CmdFanzheng { cmd: '反证'; hypName: string; }
export interface CmdRewrite { cmd: '再写'; occurrence?: number; equalityName: string; }
export interface CmdReverse { cmd: '重反'; oldName: string; newName: string; }
export interface CmdCertain { cmd: '确定'; }

////////////////////////
// Utilities
////////////////////////

function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

export function exprEquals(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'var': return (b as VarNode).name === a.name;
    case 'const': return (b as ConstNode).value === a.value;
    case 'op': {
      const B = b as OpNode; if (a.op !== B.op) return false; if (a.args.length !== B.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!exprEquals(a.args[i], B.args[i])) return false;
      return true;
    }
    case 'func': {
      const B = b as FuncNode; if (a.name !== B.name) return false; if (a.args.length !== B.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!exprEquals(a.args[i], B.args[i])) return false;
      return true;
    }
  }
}

export type Path = (number | 'lhs' | 'rhs')[];

export function findOccurrencesInExpr(root: Expr, target: Expr): Path[] {
  const res: Path[] = [];
  function rec(node: Expr, path: Path) {
    if (exprEquals(node, target)) res.push(path.slice());
    if (node.type === 'op' || node.type === 'func') node.args.forEach((ch, i) => { path.push(i); rec(ch, path); path.pop(); });
  }
  rec(root, []);
  return res;
}

export function getAtPathInFact(f: Fact, path: Path): Expr {
  let node: any = f;
  for (const p of path) {
    if (p === 'lhs') node = node.lhs;
    else if (p === 'rhs') node = node.rhs;
    else node = node.args[p as number];
  }
  return node as Expr;
}

export function setAtPathInFact(f: Fact, path: Path, replacement: Expr): void {
  if (path.length === 0) throw new Error('cannot replace the root fact directly');
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  let parent: any = f;
  for (const p of parentPath) {
    if (p === 'lhs') parent = parent.lhs;
    else if (p === 'rhs') parent = parent.rhs;
    else parent = parent.args[p as number];
  }
  if (last === 'lhs') parent.lhs = replacement;
  else if (last === 'rhs') parent.rhs = replacement;
  else parent.args[last as number] = replacement;
}

////////////////////////
// Expr factory
////////////////////////
export const Expr = {
  var: (name: string): VarNode => ({ type: 'var', name }),
  const: (v: string | number): ConstNode => ({ type: 'const', value: v }),
  add: (...args: Expr[]) => ({ type: 'op', op: 'add', args } as OpNode),
  sub: (a: Expr, b: Expr) => ({ type: 'op', op: 'sub', args: [a, b] } as OpNode),
  mul: (...args: Expr[]) => ({ type: 'op', op: 'mul', args } as OpNode),
  div: (a: Expr, b: Expr) => ({ type: 'op', op: 'div', args: [a, b] } as OpNode),
  neg: (a: Expr) => ({ type: 'op', op: 'neg', args: [a] } as OpNode),
  pow: (a: Expr, b: Expr) => ({ type: 'op', op: 'pow', args: [a, b] } as OpNode),
  func: (name: string, ...args: Expr[]) => ({ type: 'func', name, args } as FuncNode),
  conj: (x: Expr) => Expr.func('conj', x),
  Re: (x: Expr) => Expr.func('Re', x),
  Im: (x: Expr) => Expr.func('Im', x),
  sqnorm: (x: Expr) => Expr.func('sqnorm', x),
  eq: (a: Expr, b: Expr): FactEq => ({ kind: 'eq', lhs: a, rhs: b }),
  neq: (a: Expr, b: Expr): FactNeq => ({ kind: 'neq', lhs: a, rhs: b }),
};

////////////////////////
// mathjs conversion: two variants
// - Opaque: map conj/Re/Im/sqnorm to placeholders (used by 多能)
// - Real : map conj/Re/Im to math.js functions and expand sqnorm -> a * conj(a) (used by 确定)
////////////////////////

const OPAQUE_FUNC_MAP: Record<string, string> = { conj: 'F_CONJ', Re: 'F_RE', Im: 'F_IM', sqnorm: 'F_SQNORM' };

export function exprToMathJSStringOpaque(expr: Expr): string {
  switch (expr.type) {
    case 'var': return expr.name;
    case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
    case 'op': {
      if (expr.op === 'add') return expr.args.map(exprToMathJSStringOpaque).join(' + ');
      if (expr.op === 'sub') return `(${exprToMathJSStringOpaque(expr.args[0])} - ${exprToMathJSStringOpaque(expr.args[1])})`;
      if (expr.op === 'mul') return expr.args.map(a => `(${exprToMathJSStringOpaque(a)})`).join(' * ');
      if (expr.op === 'div') return `(${exprToMathJSStringOpaque(expr.args[0])} / ${exprToMathJSStringOpaque(expr.args[1])})`;
      if (expr.op === 'neg') return `(-${exprToMathJSStringOpaque(expr.args[0])})`;
      if (expr.op === 'pow') return `(${exprToMathJSStringOpaque(expr.args[0])} ^ ${exprToMathJSStringOpaque(expr.args[1])})`;
      break;
    }
    case 'func': {
      const fname = OPAQUE_FUNC_MAP[expr.name] || expr.name;
      return `${fname}(${expr.args.map(exprToMathJSStringOpaque).join(',')})`;
    }
  }
}

export function exprToMathJSStringReal(expr: Expr): string {
  switch (expr.type) {
    case 'var': return expr.name;
    case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
    case 'op': {
      if (expr.op === 'add') return expr.args.map(exprToMathJSStringReal).join(' + ');
      if (expr.op === 'sub') return `(${exprToMathJSStringReal(expr.args[0])} - ${exprToMathJSStringReal(expr.args[1])})`;
      if (expr.op === 'mul') return expr.args.map(a => `(${exprToMathJSStringReal(a)})`).join(' * ');
      if (expr.op === 'div') return `(${exprToMathJSStringReal(expr.args[0])} / ${exprToMathJSStringReal(expr.args[1])})`;
      if (expr.op === 'neg') return `(-${exprToMathJSStringReal(expr.args[0])})`;
      if (expr.op === 'pow') return `(${exprToMathJSStringReal(expr.args[0])} ^ ${exprToMathJSStringReal(expr.args[1])})`;
      break;
    }
    case 'func': {
      const argStrs = expr.args.map(exprToMathJSStringReal);
      if (expr.name === 'conj') return `conj(${argStrs.join(',')})`;
      if (expr.name === 'Re') return `re(${argStrs.join(',')})`;
      if (expr.name === 'Im') return `im(${argStrs.join(',')})`;
      if (expr.name === 'sqnorm') {
        const a = argStrs[0];
        return `(${a} * conj(${a}))`;
      }
      return `${expr.name}(${argStrs.join(',')})`;
    }
  }
}

export function isConstantExpr(e: Expr): boolean {
  if (e.type === 'const') return true;
  if (e.type === 'var') return false;
  if (e.type === 'op' || e.type === 'func') return e.args.every(isConstantExpr);
  return false;
}

export function collectDenominatorsInExpr(expr: Expr): Expr[] {
  const dens: Expr[] = [];
  function rec(node: Expr) {
    if (node.type === 'op') {
      if (node.op === 'div') { dens.push(node.args[1]); rec(node.args[0]); rec(node.args[1]); }
      else node.args.forEach(rec);
    } else if (node.type === 'func') node.args.forEach(rec);
  }
  rec(expr); return dens;
}

////////////////////////
// Context
////////////////////////
export class Context {
  private map: Map<string, Fact> = new Map();
  clone(): Context { const c = new Context(); for (const [k, v] of this.map.entries()) c.map.set(k, deepClone(v)); return c; }
  addFact(name: string, fact: Fact) { if (this.map.has(name)) throw new Error(`fact name already present: ${name}`); this.map.set(name, deepClone(fact)); }
  setFact(name: string, fact: Fact) { this.map.set(name, deepClone(fact)); }
  getFact(name: string): Fact | undefined { return this.map.get(name); }
  has(name: string) { return this.map.has(name); }
  keys(): string[] { return Array.from(this.map.keys()); }
}

////////////////////////
// Prover (core command implementations)
////////////////////////
export class Prover {
  context: Context;
  logger: (s: string) => void = () => {};
  constructor(initialFacts: Array<{ name: string; fact: Fact }> = []) { this.context = new Context(); for (const f of initialFacts) this.context.addFact(f.name, f.fact); }
  setLogger(fn: (s: string) => void) { this.logger = fn; }

  // New: seed context with facts after construction. Optionally overwrite existing names.
  seedContext(initialFacts: Array<{ name: string; fact: Fact }>, overwrite = false): { ok: boolean; message?: string } {
    for (const f of initialFacts) {
      if (!overwrite && this.context.has(f.name)) return { ok: false, message: `name collision: ${f.name}` };
      if (overwrite) this.context.setFact(f.name, f.fact); else this.context.addFact(f.name, f.fact);
      this.logger(`seeded fact '${f.name}' into prover context`);
    }
    return { ok: true };
  }

  have(name: string, fact: Fact, commands?: Command[]): boolean {
    const sub = new Prover(); sub.context = this.context.clone(); sub.setLogger((s) => this.logger(`[${name}] ${s}`));
    const ok = sub._runProofGoal(deepClone(fact), commands || []);
    if (!ok) throw new Error(`Proof failed for ${name}`);
    this.context.addFact(name, deepClone(fact)); this.logger(`Added fact '${name}' to context`); return true;
  }

  public runSingleCommandOnState(state: { goal: Fact; context: Context }, cmd: Command): boolean {
    return this._runCommand(state, cmd);
  }

  private _runProofGoal(goal: Fact, commands: Command[]): boolean {
    const state = { goal: deepClone(goal) as Fact, context: this.context };
    this.logger(`Start goal: ${factToReadable(state.goal)}`);
    for (const cmd of commands) {
      this.logger(`Run cmd: ${JSON.stringify(cmd)}`);
      const ok = this._runCommand(state, cmd as any);
      if (!ok) { this.logger(`Command failed: ${JSON.stringify(cmd)}`); return false; }
    }
    const finalOk = this._checkGoalProved(state.goal);
    this.logger(`Final goal check: ${finalOk}`);
    return finalOk;
  }

  private _runCommand(state: { goal: Fact; context: Context }, cmd: Command): boolean {
    switch (cmd.cmd) {
      case '不利': return this._cmd_buli(state, cmd as CmdBuli);
      case '多能': return this._cmd_duoneng(state, cmd as CmdDuoneng);
      case '反证': return this._cmd_fanzheng(state, cmd as CmdFanzheng);
      case '再写': return this._cmd_rewrite(state, cmd as CmdRewrite);
      case '重反': return this._cmd_reverse(state, cmd as CmdReverse);
      case '确定': return this._cmd_certain(state, cmd as CmdCertain);
      default: throw new Error(`Unknown command: ${(cmd as any).cmd}`);
    }
  }

  private _cmd_buli(state: { goal: Fact; context: Context }, cmd: CmdBuli): boolean {
    const hyp = state.context.getFact(cmd.hypothesis);
    if (!hyp) { this.logger(`hypothesis not found: ${cmd.hypothesis}`); return false; }
    if (hyp.kind !== 'neq') { this.logger('不利 expects hypothesis of kind neq'); return false; }
    const occ = findOccurrencesInExpr(hyp.lhs, cmd.component);
    if (occ.length === 0) { this.logger('component not found inside hypothesis.lhs'); return false; }
    const newFact: Fact = { kind: 'neq', lhs: deepClone(cmd.component), rhs: deepClone(hyp.rhs) };
    state.context.addFact(cmd.newName, newFact);
    this.logger(`Added non-equal fact '${cmd.newName}': ${factToReadable(newFact)}`);
    return true;
  }

  private _cmd_duoneng(state: { goal: Fact; context: Context }, cmd: CmdDuoneng): boolean {
    const goal = state.goal;
    if (goal.kind !== 'eq') { this.logger('多能 currently only supports equality goals'); return false; }
    const dens = collectDenominatorsInExpr(goal.lhs).concat(collectDenominatorsInExpr(goal.rhs));
    const needed: Expr[] = dens.filter(d => !isConstantExpr(d));
    const supplied = new Set(cmd.denomProofs || []);
    for (const name of supplied) {
      const f = state.context.getFact(name);
      if (!f) { this.logger(`denominator proof not found: ${name}`); return false; }
      if (f.kind !== 'neq') { this.logger(`denominator proof '${name}' must be an inequality`); return false; }
      if (!(f.rhs.type === 'const' && f.rhs.value === 0)) { this.logger(`denominator proof '${name}' must prove denom ≠ 0`); return false; }
    }
    for (const d of needed) {
      let matched = false;
      for (const name of supplied) {
        const f = state.context.getFact(name)!;
        if (exprEquals(f.lhs, d)) { matched = true; break; }
      }
      if (!matched) { this.logger('A denominator was not proven non-zero: ' + exprToReadableString(d)); return false; }
    }
    const diff = `(${exprToMathJSStringOpaque(goal.lhs)}) - (${exprToMathJSStringOpaque(goal.rhs)})`;
    try {
      const s = math.simplify(diff as any);
      const sStr = s.toString(); this.logger(`math.simplify -> ${sStr}`);
      if (sStr === '0' || sStr === '0.0') return true;
      if (diff.includes('F_CONJ') || diff.includes('F_RE') || diff.includes('F_IM') || diff.includes('F_SQNORM')) { this.logger('多能: contains opaque functions; cannot numeric-test'); return false; }
      const varNames = collectVarNames(goal);
      for (let attempt = 0; attempt < 3; attempt++) {
        const scope: Record<string, number> = {};
        const val = 2 + attempt;
        for (const v of varNames) scope[v] = val;
        const ev = math.evaluate(diff, scope);
        if (Math.abs(Number(ev)) > 1e-9) return false;
      }
      return true;
    } catch (e) { this.logger('多能 simplify failed: ' + (e as Error).message); return false; }
  }

  private _cmd_fanzheng(state: { goal: Fact; context: Context }, cmd: CmdFanzheng): boolean {
    const h = state.context.getFact(cmd.hypName);
    if (!h) { this.logger(`反证: fact not found ${cmd.hypName}`); return false; }
    if (h.kind !== 'neq') { this.logger('反证 expects a non-equality (neq) hypothesis'); return false; }
    if (state.goal.kind !== 'neq') { this.logger('反证 expects the current goal to be an inequality (neq)'); return false; }
    const newEq: FactEq = { kind: 'eq', lhs: deepClone(state.goal.lhs), rhs: deepClone(state.goal.rhs) };
    state.context.setFact(cmd.hypName, newEq); // overwrite hypothesis
    state.goal = { kind: 'eq', lhs: deepClone(h.lhs), rhs: deepClone(h.rhs) };
    this.logger(`反证 applied: replaced '${cmd.hypName}' with ${factToReadable(newEq)}; new goal ${factToReadable(state.goal)}`);
    return true;
  }

  private _cmd_rewrite(state: { goal: Fact; context: Context }, cmd: CmdRewrite): boolean {
    const f = state.context.getFact(cmd.equalityName);
    if (!f) { this.logger(`再写: equality not found: ${cmd.equalityName}`); return false; }
    if (f.kind !== 'eq') { this.logger('再写 expects an equality fact'); return false; }
    const occA = findOccurrencesInExpr(state.goal.lhs, f.lhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: f.rhs }));
    const occAonR = findOccurrencesInExpr(state.goal.rhs, f.lhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: f.rhs }));
    const occB = findOccurrencesInExpr(state.goal.lhs, f.rhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: f.lhs }));
    const occBonR = findOccurrencesInExpr(state.goal.rhs, f.rhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: f.lhs }));
    const all = occA.concat(occAonR).concat(occB).concat(occBonR);
    if (all.length < (cmd.occurrence || 1)) { this.logger('再写: occurrence not found'); return false; }
    const chosen = all[(cmd.occurrence || 1) - 1]; setAtPathInFact(state.goal, chosen.path, deepClone(chosen.replaceWith));
    this.logger(`再写 applied at occurrence ${cmd.occurrence}`); return true;
  }

  private _cmd_reverse(state: { goal: Fact; context: Context }, cmd: CmdReverse): boolean {
    const f = state.context.getFact(cmd.oldName);
    if (!f) { this.logger(`重反: fact not found ${cmd.oldName}`); return false; }
    if (f.kind !== 'eq') { this.logger('重反 expects an equality fact'); return false; }
    const newFact: FactEq = { kind: 'eq', lhs: deepClone(f.rhs), rhs: deepClone(f.lhs) };
    state.context.addFact(cmd.newName, newFact); this.logger(`重反: added ${cmd.newName} = ${factToReadable(newFact)}`); return true;
  }

  private _cmd_certain(state: { goal: Fact; context: Context }, _cmd: CmdCertain): boolean {
    const goal = state.goal; if (goal.kind !== 'eq') { this.logger('确定 expects an equality goal'); return false; }
    if (!isConstantExpr(goal.lhs) || !isConstantExpr(goal.rhs)) { this.logger('确定: not both sides constant'); return false; }
    try {
      const diff = `(${exprToMathJSStringReal(goal.lhs)}) - (${exprToMathJSStringReal(goal.rhs)})`;
      const s = math.simplify(diff as any);
      const sStr = s.toString();
      this.logger(`确定: simplify -> ${sStr}`);
      return sStr === '0' || sStr === '0.0';
    } catch (e) { this.logger('确定 simplify failed: ' + (e as Error).message); return false; }
  }

  private _checkGoalProved(goal: Fact): boolean {
    if (goal.kind === 'eq') {
      if (exprEquals(goal.lhs, goal.rhs)) return true;
      for (const k of this.context.keys()) { const f = this.context.getFact(k)!; if (f.kind === 'eq' && exprEquals(f.lhs, goal.lhs) && exprEquals(f.rhs, goal.rhs)) return true; }
      return false;
    }
    if (goal.kind === 'neq') {
      for (const k of this.context.keys()) { const f = this.context.getFact(k)!; if (f.kind === 'neq' && exprEquals(f.lhs, goal.lhs) && exprEquals(f.rhs, goal.rhs)) return true; }
      return false;
    }
    return false;
  }
}

////////////////////////
// ProofSession & Frames: Fluent Piecemeal RPC (with seeding APIs)
////////////////////////

export interface FrameState { id: string; name: string; goal: Fact; context: Context; commands: Command[]; completed: boolean; parentFrameId?: string | null; }

export class ProofSession {
  private globalContext: Context = new Context();
  private frames: Map<string, FrameState> = new Map();
  private counter = 0;
  logger: (s: string) => void = () => {};

  constructor(initialFacts: Array<{ name: string; fact: Fact }> = []) { for (const f of initialFacts) this.globalContext.addFact(f.name, f.fact); }
  setLogger(fn: (s: string) => void) { this.logger = fn; }

  // Add a single global fact. If overwrite=false, will fail on name collision.
  addGlobalFact(name: string, fact: Fact, overwrite = false): { ok: boolean; message?: string } {
    if (!overwrite && this.globalContext.has(name)) return { ok: false, message: `global fact already present: ${name}` };
    if (overwrite) this.globalContext.setFact(name, fact); else this.globalContext.addFact(name, fact);
    this.logger(`Added global fact '${name}'`);
    return { ok: true };
  }

  // Seed a batch of facts into the global context. If overwrite=false, will error on first collision.
  seedGlobalContext(initialFacts: Array<{ name: string; fact: Fact }>, overwrite = false): { ok: boolean; message?: string } {
    for (const f of initialFacts) {
      const res = this.addGlobalFact(f.name, f.fact, overwrite);
      if (!res.ok) return { ok: false, message: `seeding failed at ${f.name}: ${res.message}` };
    }
    return { ok: true };
  }

  startHave(name: string, goal: Fact, parentFrameId?: string): string {
    const id = `frame_${++this.counter}`;
    const parentCtx = parentFrameId ? (this.frames.get(parentFrameId)?.context ?? this.globalContext.clone()) : this.globalContext.clone();
    const ctxClone = parentCtx.clone();
    const frame: FrameState = { id, name, goal: deepClone(goal), context: ctxClone, commands: [], completed: false, parentFrameId: parentFrameId ?? null };
    this.frames.set(id, frame);
    this.logger(`Started frame ${id} ('${name}')`);
    return id;
  }

  addCommand(frameId: string, cmd: Command): { ok: boolean; message?: string } {
    const frame = this.frames.get(frameId); if (!frame) return { ok: false, message: 'frame not found' };
    if (frame.completed) return { ok: false, message: 'frame already completed' };
    const runner = new Prover(); runner.setLogger((s) => this.logger(`[frame ${frameId}] ${s}`));
    const state = { goal: frame.goal, context: frame.context };
    const ok = runner.runSingleCommandOnState(state, cmd);
    if (!ok) return { ok: false, message: 'command failed' };
    frame.commands.push(deepClone(cmd));
    return { ok: true };
  }

  finalize(frameId: string): { ok: boolean; message?: string } {
    const frame = this.frames.get(frameId); if (!frame) return { ok: false, message: 'frame not found' };
    if (frame.completed) return { ok: false, message: 'frame already completed' };
    const prover = new Prover(); prover.setLogger((s) => this.logger(`[finalize ${frameId}] ${s}`));
    prover.context = frame.context;
    const ok = (prover as any)['_checkGoalProved'] ? (prover as any)['_checkGoalProved'](frame.goal) : false;
    if (!ok) return { ok: false, message: 'goal not yet proved' };
    if (frame.parentFrameId) {
      const parent = this.frames.get(frame.parentFrameId);
      if (!parent) return { ok: false, message: 'parent frame not found' };
      parent.context.addFact(frame.name, deepClone(frame.goal));
      this.logger(`Finalized frame ${frameId}: added '${frame.name}' to parent frame '${parent.id}' context`);
    } else {
      this.globalContext.addFact(frame.name, deepClone(frame.goal));
      this.logger(`Finalized frame ${frameId}: added '${frame.name}' to global context`);
    }
    frame.completed = true; return { ok: true };
  }

  getFrameState(frameId: string): FrameState | undefined { const f = this.frames.get(frameId); return f ? deepClone(f) : undefined; }
  listFrames(): string[] { return Array.from(this.frames.keys()); }
  getGlobalContextKeys(): string[] { return this.globalContext.keys(); }
}

////////////////////////
// Helpers & Readable
////////////////////////
export function factToReadable(f: Fact): string { return f.kind === 'eq' ? `${exprToReadableString(f.lhs)} = ${exprToReadableString(f.rhs)}` : `${exprToReadableString(f.lhs)} ≠ ${exprToReadableString(f.rhs)}`; }
export function exprToReadableString(e: Expr): string {
  if (e.type === 'var') return e.name; if (e.type === 'const') return String(e.value);
  if (e.type === 'op') {
    if (e.op === 'add') return e.args.map(exprToReadableString).join(' + ');
    if (e.op === 'mul') return e.args.map(exprToReadableString).join(' * ');
    if (e.op === 'div') return `(${exprToReadableString(e.args[0])} / ${exprToReadableString(e.args[1])})`;
    if (e.op === 'sub') return `(${exprToReadableString(e.args[0])} - ${exprToReadableString(e.args[1])})`;
    if (e.op === 'neg') return `(-${exprToReadableString(e.args[0])})`;
  }
  if (e.type === 'func') return `${e.name}(${e.args.map(exprToReadableString).join(',')})`;
  return JSON.stringify(e);
}

export function collectVarNames(f: Fact): string[] { const s = new Set<string>(); function rec(n: Expr) { if (n.type === 'var') s.add(n.name); else if (n.type === 'op' || n.type === 'func') n.args.forEach(rec); } rec(f.lhs); rec(f.rhs); return [...s]; }

////////////////////////
// Usage Example (runnable with ts-node)
////////////////////////
/*
  Steps to run:
    npm install mathjs ts-node typescript
    npx ts-node chinese_theorem_prover.ts

  Example: seed global context and run 反证 immediately
  ----------------------------------------------------
  import { Expr, ProofSession, Prover } from './chinese_theorem_prover';

  const seed = [
    { name: 'g', fact: Expr.neq(Expr.var('a'), Expr.const(5)) },
    { name: 'hm', fact: Expr.eq(Expr.var('M'), Expr.div(Expr.add(Expr.var('A'), Expr.var('B')), Expr.const(2))) }
  ];

  const sess = new ProofSession(seed); // constructor seeds global context
  sess.setLogger(console.log);

  // Start a frame with goal: a + 1 ≠ 6
  const frameId = sess.startHave('main_goal', Expr.neq(Expr.add(Expr.var('a'), Expr.const(1)), Expr.const(6)));

  // Because the frame clones global context at start, 'g' is visible inside the frame
  console.log('global context keys:', sess.getGlobalContextKeys()); // ['g','hm']

  // Run 反证 on the seeded hypothesis 'g'
  const res = sess.addCommand(frameId, { cmd: '反证', hypName: 'g' });
  console.log('反证 command result:', res);

  // Inspect frame state: 'g' should have been replaced with equality a + 1 = 6, and new goal set to a = 5
  const state = sess.getFrameState(frameId)!;
  console.log('frame context keys after 反证:', Object.keys((state.context as any).keys ? state.context.keys() : {}));
  console.log('frame goal after 反证:', state.goal && JSON.stringify(state.goal));

  // You can now continue with more commands to prove the new equality goal (for example by rewriting, applying known equalities, or starting sub-frames).

  Example: Using Prover.seedContext directly
  -----------------------------------------
  const p = new Prover();
  p.setLogger(console.log);
  p.seedContext([{ name: 'g', fact: Expr.neq(Expr.var('a'), Expr.const(5)) }]);
  // Now p.context contains g and you can call p.have(...) or run commands on p.context.
*/

////////////////////////
// Exports
////////////////////////
export default { Expr, Prover, Context, ProofSession };

