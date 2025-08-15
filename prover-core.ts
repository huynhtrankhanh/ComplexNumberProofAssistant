import * as math from 'mathjs';
import { v4 as uuid } from "uuid";
import { createHash } from "crypto";

const runtimeNonce = uuid() + uuid();
const hash = (x: string) => "aa" + createHash("sha256").update(x + runtimeNonce).digest('hex');

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

export function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

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
// Helper function for 不利 command
////////////////////////
function canProveNonZero(expr: Expr, component: Expr): boolean {
  // Check if component appears in expr in a way that it must be non-zero
  // given that expr ≠ 0
  
  if (exprEquals(expr, component)) {
    // The entire expression equals the component, so yes
    return true;
  }
  
  if (expr.type === 'op') {
    if (expr.op === 'mul') {
      // If product ≠ 0, all factors must be ≠ 0
      for (const arg of expr.args) {
        if (canProveNonZero(arg, component)) return true;
      }
    } else if (expr.op === 'div') {
      // If quotient ≠ 0, both numerator and denominator must be ≠ 0
      if (canProveNonZero(expr.args[0], component)) return true;
      if (canProveNonZero(expr.args[1], component)) return true;
    } else if (expr.op === 'neg') {
      // If -x ≠ 0, then x ≠ 0
      return canProveNonZero(expr.args[0], component);
    }
    // For add/sub, we can't deduce individual terms are non-zero
  } else if (expr.type === 'func') {
    // For certain functions, we might be able to deduce non-zero
    // For now, we'll be conservative
    if (expr.name === 'sqnorm' || expr.name === 'Re' || expr.name === 'Im' || expr.name === 'conj') {
      // If sqnorm(x) ≠ 0, then x ≠ 0
      return canProveNonZero(expr.args[0], component);
    }
  }
  
  return false;
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
////////////////////////
const OPAQUE_FUNC_MAP: Record<string, string> = { conj: 'F_CONJ', Re: 'F_RE', Im: 'F_IM', sqnorm: 'F_SQNORM' };
export function exprToMathJSStringOpaque(expr: Expr): string {
  switch (expr.type) {
    case 'var': return expr.name;
    case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
    case 'op': {
      if (expr.op === 'add') return "(" + expr.args.map(exprToMathJSStringOpaque).join(' + ') + ")";
      if (expr.op === 'sub') return `(${exprToMathJSStringOpaque(expr.args[0])} - ${exprToMathJSStringOpaque(expr.args[1])})`;
      if (expr.op === 'mul') return "(" + expr.args.map(a => `(${exprToMathJSStringOpaque(a)})`).join(' * ') + ")";
      if (expr.op === 'div') return `(${exprToMathJSStringOpaque(expr.args[0])} / ${exprToMathJSStringOpaque(expr.args[1])})`;
      if (expr.op === 'neg') return `(-${exprToMathJSStringOpaque(expr.args[0])})`;
      if (expr.op === 'pow') return `(${exprToMathJSStringOpaque(expr.args[0])} ^ ${exprToMathJSStringOpaque(expr.args[1])})`;
      return ((x: never): string => x)(expr.op);
    }
    case 'func': {
      const fname = OPAQUE_FUNC_MAP[expr.name] || expr.name;
      return hash(`${fname}(${expr.args.map(exprToMathJSStringOpaque).join(',')})`);
    }
  }
}

export function exprToMathJSStringReal(expr: Expr): string {
  switch (expr.type) {
    case 'var': return expr.name;
    case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
    case 'op': {
      if (expr.op === 'add') return "(" + expr.args.map(exprToMathJSStringReal).join(' + ') + ")";
      if (expr.op === 'sub') return `(${exprToMathJSStringReal(expr.args[0])} - ${exprToMathJSStringReal(expr.args[1])})`;
      if (expr.op === 'mul') return "(" + expr.args.map(a => `(${exprToMathJSStringReal(a)})`).join(' * ') + ")";
      if (expr.op === 'div') return `(${exprToMathJSStringReal(expr.args[0])} / ${exprToMathJSStringReal(expr.args[1])})`;
      if (expr.op === 'neg') return `(-${exprToMathJSStringReal(expr.args[0])})`;
      if (expr.op === 'pow') return `(${exprToMathJSStringReal(expr.args[0])} ^ ${exprToMathJSStringReal(expr.args[1])})`;
      return ((x: never): string => x)(expr.op);
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
// Pattern matching utilities for rewrite rules
////////////////////////

function isPatternVar(v: VarNode): boolean { return v.name.length > 0 && (v.name[0] === '?' || v.name[0] === '$'); }

type Bindings = Record<string, Expr>;

function patternMatch(pattern: Expr, node: Expr, bindings: Bindings): boolean {
  if (pattern.type === 'var' && isPatternVar(pattern)) {
    const key = pattern.name;
    if (bindings[key]) return exprEquals(bindings[key], node);
    bindings[key] = deepClone(node);
    return true;
  }
  if (pattern.type !== node.type) return false;
  if (pattern.type === 'const') return (node as ConstNode).value === (pattern as ConstNode).value;
  if (pattern.type === 'var') return (pattern as VarNode).name === (node as VarNode).name;
  if (pattern.type === 'op') {
    const p = pattern as OpNode; const n = node as OpNode;
    if (p.op !== n.op) return false; if (p.args.length !== n.args.length) return false;
    for (let i = 0; i < p.args.length; i++) if (!patternMatch(p.args[i], n.args[i], bindings)) return false;
    return true;
  }
  if (pattern.type === 'func') {
    const p = pattern as FuncNode; const n = node as FuncNode;
    if (p.name !== n.name) return false; if (p.args.length !== n.args.length) return false;
    for (let i = 0; i < p.args.length; i++) if (!patternMatch(p.args[i], n.args[i], bindings)) return false;
    return true;
  }
  return false;
}

function instantiate(pattern: Expr, bindings: Bindings): Expr {
  if (pattern.type === 'var' && isPatternVar(pattern)) {
    const b = bindings[pattern.name];
    if (!b) throw new Error(`unbound pattern variable ${pattern.name}`);
    return deepClone(b);
  }
  if (pattern.type === 'var' || pattern.type === 'const') return deepClone(pattern);
  if (pattern.type === 'op') return { type: 'op', op: pattern.op, args: pattern.args.map(a => instantiate(a, bindings)) } as OpNode;
  return { type: 'func', name: pattern.name, args: pattern.args.map(a => instantiate(a, bindings)) } as FuncNode;
}

function findPatternOccurrencesInExpr(root: Expr, pattern: Expr): Array<{ path: Path; bindings: Bindings }> {
  const res: Array<{ path: Path; bindings: Bindings }> = [];
  function rec(node: Expr, path: Path) {
    const bindings: Bindings = {};
    if (patternMatch(pattern, node, bindings)) res.push({ path: path.slice(), bindings });
    if (node.type === 'op' || node.type === 'func') node.args.forEach((ch, i) => { path.push(i); rec(ch, path); path.pop(); });
  }
  rec(root, []);
  return res;
}

////////////////////////
// Default named rewrite rules
////////////////////////
export const DEFAULT_REWRITE_RULES: Record<string, { lhs: Expr; rhs: Expr }> = {
  conj_inv: { lhs: Expr.func('conj', Expr.func('conj', Expr.var('?a'))), rhs: Expr.var('?a') },
  conj_add: { lhs: Expr.func('conj', Expr.add(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.add(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  conj_mul: { lhs: Expr.func('conj', Expr.mul(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.mul(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  conj_sub: { lhs: Expr.func('conj', Expr.sub(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.sub(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  conj_div: { lhs: Expr.func('conj', Expr.div(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.div(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  conj_neg: { lhs: Expr.func('conj', Expr.neg(Expr.var('?a'))), rhs: Expr.neg(Expr.func('conj', Expr.var('?a'))) },
  sqnorm_def: { lhs: Expr.func('sqnorm', Expr.var('?a')), rhs: Expr.mul(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))) },
  re_def: { lhs: Expr.func('Re', Expr.var('?a')), rhs: Expr.div(Expr.add(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))), Expr.const(2)) },
  im_def: { lhs: Expr.func('Im', Expr.var('?a')), rhs: Expr.div(Expr.sub(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))), Expr.const(2)) },
  i_square: { lhs: Expr.mul(Expr.var('i'), Expr.var('i')), rhs: Expr.const(-1) },
};

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
// Command history records (for strict insertion-order & historical snapshots)
////////////////////////
export type RecordKind = 'start_frame' | 'cmd' | 'finalize_frame';
export interface CommandRecord {
  kind: RecordKind;
  frameId: string;
  frameName?: string; // for start_frame/finalize_frame
  parentFrameId?: string | null; // for start_frame
  goal?: Fact; // snapshot for start_frame
  cmd?: Command; // original command (for kind==='cmd')
  // resolved snapshots capture any referenced facts/expressions at execution time
  resolved?: Record<string, any>;
  ts: number;
}

type State = { goal: Fact; context: Context, explicitCompletion: boolean };

////////////////////////
// Prover (core command implementations)
////////////////////////
export class Prover {
  logger: (s: string) => void = () => {};
  rewriteRules: Record<string, { lhs: Expr; rhs: Expr }>;
  constructor(rules: Record<string, { lhs: Expr; rhs: Expr }> = DEFAULT_REWRITE_RULES) {
    this.rewriteRules = rules;
  }
  setLogger(fn: (s: string) => void) { this.logger = fn; }

  public runCommand(state: State, cmd: Command): boolean {
    if (state.explicitCompletion) { this.logger("proof complete for frame, no more steps accepted"); return false; }

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

  private _cmd_buli(state: State, cmd: CmdBuli): boolean {
    const hyp = state.context.getFact(cmd.hypothesis);
    if (!hyp) { this.logger(`hypothesis not found: ${cmd.hypothesis}`); return false; }
    if (hyp.kind !== 'neq') { this.logger('不利 expects hypothesis of kind neq'); return false; }
    
    // Check if hypothesis is of form expr ≠ 0
    const isZero = hyp.rhs.type === 'const' && (hyp.rhs.value === 0 || hyp.rhs.value === '0');
    if (!isZero) {
      this.logger(`不利: right hand side of ≠ is not 0`);
      return false;
    }
    
    // New behavior: if hypothesis is expr ≠ 0, check if component must be non-zero
    if (!canProveNonZero(hyp.lhs, cmd.component)) {
      this.logger(`不利: cannot prove ${exprToReadableString(cmd.component)} ≠ 0 from ${exprToReadableString(hyp.lhs)} ≠ 0`);
      return false;
    }
    
    // Create the fact: component ≠ 0
    const newFact: Fact = { kind: 'neq', lhs: deepClone(cmd.component), rhs: Expr.const(0) };
    state.context.addFact(cmd.newName, newFact);
    this.logger(`Added non-equal fact '${cmd.newName}': ${factToReadable(newFact)}`);
    return true;
  }

  private _cmd_duoneng(state: State, cmd: CmdDuoneng): boolean {
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
    console.log("original expression", diff);
    try {
      const s = math.simplify(math.rationalize(math.simplify(diff as any)));
      const sStr = s.toString(); this.logger(`math.simplify -> ${sStr}`);
      if (sStr === '0' || sStr === '0.0') {
        state.explicitCompletion = true;
        this.logger("frame complete");
        return true;
      }
      this.logger("多能 simplify failed, can't prove with field axioms");
      console.log(s.toString());
      return false;
    } catch (e) { this.logger('多能 simplify failed: ' + (e as Error).message); return false; }
  }

  private _cmd_fanzheng(state: State, cmd: CmdFanzheng): boolean {
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

  private _cmd_rewrite(state: State, cmd: CmdRewrite): boolean {
    const ruleName = cmd.equalityName;
    const ruleFromContext = state.context.getFact(ruleName);
    const isContextEq = !!(ruleFromContext && ruleFromContext.kind === 'eq');
    const ruleFromRegistry = (this.rewriteRules && this.rewriteRules[ruleName]);
    if (!isContextEq && !ruleFromRegistry) { this.logger(`再写: neither equality fact nor rewrite rule named '${ruleName}' found`); return false; }

    const occurrences: Array<{ path: Path; replaceWith: Expr }> = [];

    if (isContextEq) {
      const f = ruleFromContext as FactEq;
      const occA = findOccurrencesInExpr(state.goal.lhs, f.lhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: deepClone(f.rhs) }));
      const occAonR = findOccurrencesInExpr(state.goal.rhs, f.lhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: deepClone(f.rhs) }));
      const occB = findOccurrencesInExpr(state.goal.lhs, f.rhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: deepClone(f.lhs) }));
      const occBonR = findOccurrencesInExpr(state.goal.rhs, f.rhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: deepClone(f.lhs) }));
      occurrences.push(...occA, ...occAonR, ...occB, ...occBonR);
    }

    if (ruleFromRegistry) {
      const rule = ruleFromRegistry;
      const occLHS = findPatternOccurrencesInExpr(state.goal.lhs, rule.lhs).map(x => ({ path: ['lhs', ...x.path] as Path, replaceWith: instantiate(rule.rhs, x.bindings) }));
      const occLHS_R = findPatternOccurrencesInExpr(state.goal.rhs, rule.lhs).map(x => ({ path: ['rhs', ...x.path] as Path, replaceWith: instantiate(rule.rhs, x.bindings) }));
      const occRHS = findPatternOccurrencesInExpr(state.goal.lhs, rule.rhs).map(x => ({ path: ['lhs', ...x.path] as Path, replaceWith: instantiate(rule.lhs, x.bindings) }));
      const occRHS_R = findPatternOccurrencesInExpr(state.goal.rhs, rule.rhs).map(x => ({ path: ['rhs', ...x.path] as Path, replaceWith: instantiate(rule.lhs, x.bindings) }));
      occurrences.push(...occLHS, ...occLHS_R, ...occRHS, ...occRHS_R);
    }

    if (occurrences.length < (cmd.occurrence || 1)) { this.logger('再写: occurrence not found'); return false; }
    const chosen = occurrences[(cmd.occurrence || 1) - 1];
    setAtPathInFact(state.goal, chosen.path, deepClone(chosen.replaceWith));
    this.logger(`再写 applied at occurrence ${cmd.occurrence} using ${ruleName}`);
    return true;
  }

  private _cmd_reverse(state: State, cmd: CmdReverse): boolean {
    const f = state.context.getFact(cmd.oldName);
    if (!f) { this.logger(`重反: fact not found ${cmd.oldName}`); return false; }
    if (f.kind !== 'eq') { this.logger('重反 expects an equality fact'); return false; }
    const newFact: FactEq = { kind: 'eq', lhs: deepClone(f.rhs), rhs: deepClone(f.lhs) };
    state.context.addFact(cmd.newName, newFact); this.logger(`重反: added ${cmd.newName} = ${factToReadable(newFact)}`); return true;
  }

  private _cmd_certain(state: State, _cmd: CmdCertain): boolean {
    const goal = state.goal; if (goal.kind !== 'eq') { this.logger('确定 expects an equality goal'); return false; }
    if (!isConstantExpr(goal.lhs) || !isConstantExpr(goal.rhs)) { this.logger('确定: not both sides constant'); return false; }
    try {
      const diff = `(${exprToMathJSStringReal(goal.lhs)}) - (${exprToMathJSStringReal(goal.rhs)})`;
      const s = math.simplify(diff as any);
      const sStr = s.toString(); this.logger(`确定: simplify -> ${sStr}`);
      if (sStr === '0' || sStr === '0.0') {
        this.logger("frame complete");
        state.explicitCompletion = true;
        return true;
      }
      return false;
    } catch (e) { this.logger('确定 simplify failed: ' + (e as Error).message); return false; }
  }

  public checkGoalProved(state: State): boolean {
    if (state.explicitCompletion) {
      console.log("hooray! it's an explicit completion");
      return true;
    }
    if (state.goal.kind === 'eq') {
      if (exprEquals(state.goal.lhs, state.goal.rhs)) return true;
      for (const k of state.context.keys()) { const f = state.context.getFact(k)!; if (f.kind === 'eq' && exprEquals(f.lhs, state.goal.lhs) && exprEquals(f.rhs, state.goal.rhs)) return true; }
      return false;
    }
    if (state.goal.kind === 'neq') {
      for (const k of state.context.keys()) { const f = state.context.getFact(k)!; if (f.kind === 'neq' && exprEquals(f.lhs, state.goal.lhs) && exprEquals(f.rhs, state.goal.rhs)) return true; }
      return false;
    }
    return false;
  }
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
// Exports
////////////////////////
export default { Expr, Prover, Context, DEFAULT_REWRITE_RULES };
