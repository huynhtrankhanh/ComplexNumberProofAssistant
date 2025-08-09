// chinese_theorem_prover.ts
// TypeScript implementation of the Chinese Theorem Prover (no parser).
// Ultrathink update: full named rewrite-rule system for 再写 (rewrite) with pattern matching.
// - Adds a fixed, auditable set of rewrite rules (conj_inv, conj_add, conj_mul, etc.).
// - 再写 may only use either: a named rewrite rule from the registry, OR an equality fact present in context.
// - Pattern variables in rules are written as variable names starting with `?` (e.g. ?a, ?b).
// - Provides robust pattern matching & instantiation with binding consistency checks.
// - ProofSession still supports seeding contexts and piecemeal commands.

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
// Pattern matching utilities for rewrite rules
////////////////////////

function isPatternVar(v: VarNode): boolean { return v.name.length > 0 && (v.name[0] === '?' || v.name[0] === '$'); }

// Bindings map: pattern variable name -> Expr
type Bindings = Record<string, Expr>;

function patternMatch(pattern: Expr, node: Expr, bindings: Bindings): boolean {
  // if pattern is a meta-variable, bind it
  if (pattern.type === 'var' && isPatternVar(pattern)) {
    const key = pattern.name;
    if (bindings[key]) return exprEquals(bindings[key], node);
    bindings[key] = deepClone(node);
    return true;
  }
  // otherwise structure must match
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
// Default named rewrite rules (full set)
////////////////////////
export const DEFAULT_REWRITE_RULES: Record<string, { lhs: Expr; rhs: Expr }> = {
  // conj (conj a) = a
  conj_inv: { lhs: Expr.func('conj', Expr.func('conj', Expr.var('?a'))), rhs: Expr.var('?a') },
  // conj(a + b) = conj a + conj b
  conj_add: { lhs: Expr.func('conj', Expr.add(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.add(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  // conj(a * b) = conj a * conj b
  conj_mul: { lhs: Expr.func('conj', Expr.mul(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.mul(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  // conj(a - b) = conj a - conj b
  conj_sub: { lhs: Expr.func('conj', Expr.sub(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.sub(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  // conj(a / b) = conj a / conj b
  conj_div: { lhs: Expr.func('conj', Expr.div(Expr.var('?a'), Expr.var('?b'))), rhs: Expr.div(Expr.func('conj', Expr.var('?a')), Expr.func('conj', Expr.var('?b'))) },
  // conj(-a) = -conj a
  conj_neg: { lhs: Expr.func('conj', Expr.neg(Expr.var('?a'))), rhs: Expr.neg(Expr.func('conj', Expr.var('?a'))) },
  // sqnorm a = a * conj a
  sqnorm_def: { lhs: Expr.func('sqnorm', Expr.var('?a')), rhs: Expr.mul(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))) },
  // Re a = (a + conj a) / 2
  re_def: { lhs: Expr.func('Re', Expr.var('?a')), rhs: Expr.div(Expr.add(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))), Expr.const(2)) },
  // Im a = (a - conj a) / 2
  im_def: { lhs: Expr.func('Im', Expr.var('?a')), rhs: Expr.div(Expr.sub(Expr.var('?a'), Expr.func('conj', Expr.var('?a'))), Expr.const(2)) },
  // i * i = -1
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
// Prover (core command implementations)
////////////////////////
export class Prover {
  context: Context;
  logger: (s: string) => void = () => {};
  rewriteRules: Record<string, { lhs: Expr; rhs: Expr }>; // available rewrite rules
  constructor(initialFacts: Array<{ name: string; fact: Fact }> = [], rules: Record<string, { lhs: Expr; rhs: Expr }> = DEFAULT_REWRITE_RULES) {
    this.context = new Context(); for (const f of initialFacts) this.context.addFact(f.name, f.fact); this.rewriteRules = rules;
  }
  setLogger(fn: (s: string) => void) { this.logger = fn; }

  seedContext(initialFacts: Array<{ name: string; fact: Fact }>, overwrite = false): { ok: boolean; message?: string } {
    for (const f of initialFacts) {
      if (!overwrite && this.context.has(f.name)) return { ok: false, message: `name collision: ${f.name}` };
      if (overwrite) this.context.setFact(f.name, f.fact); else this.context.addFact(f.name, f.fact);
      this.logger(`seeded fact '${f.name}' into prover context`);
    }
    return { ok: true };
  }

  have(name: string, fact: Fact, commands?: Command[]): boolean {
    const sub = new Prover(); sub.context = this.context.clone(); sub.setLogger((s) => this.logger(`[${name}] ${s}`)); sub.rewriteRules = this.rewriteRules;
    const ok = sub._runProofGoal(deepClone(fact), commands || []);
    if (!ok) throw new Error(`Proof failed for ${name}`);
    this.context.addFact(name, deepClone(fact)); this.logger(`Added fact '${name}' to context`); return true;
  }

  public runSingleCommandOnState(state: { goal: Fact; context: Context }, cmd: Command): boolean {
    // ensure sub-prover has access to rules
    (this as any).rewriteRules = this.rewriteRules;
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

  // 再写 now supports either a context equality fact or a named rewrite rule from rewriteRules
  private _cmd_rewrite(state: { goal: Fact; context: Context }, cmd: CmdRewrite): boolean {
    const ruleName = cmd.equalityName;
    const ruleFromContext = state.context.getFact(ruleName);
    const isContextEq = !!(ruleFromContext && ruleFromContext.kind === 'eq');
    const ruleFromRegistry = (this.rewriteRules && this.rewriteRules[ruleName]);
    if (!isContextEq && !ruleFromRegistry) { this.logger(`再写: neither equality fact nor rewrite rule named '${ruleName}' found`); return false; }

    const occurrences: Array<{ path: Path; replaceWith: Expr }> = [];

    // If context equality: previous behavior (find syntactic occurrences of lhs/rhs)
    if (isContextEq) {
      const f = ruleFromContext as FactEq;
      const occA = findOccurrencesInExpr(state.goal.lhs, f.lhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: deepClone(f.rhs) }));
      const occAonR = findOccurrencesInExpr(state.goal.rhs, f.lhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: deepClone(f.rhs) }));
      const occB = findOccurrencesInExpr(state.goal.lhs, f.rhs).map(p => ({ path: ['lhs', ...p] as Path, replaceWith: deepClone(f.lhs) }));
      const occBonR = findOccurrencesInExpr(state.goal.rhs, f.rhs).map(p => ({ path: ['rhs', ...p] as Path, replaceWith: deepClone(f.lhs) }));
      occurrences.push(...occA, ...occAonR, ...occB, ...occBonR);
    }

    // If rewrite rule from registry: pattern match lhs and rhs with meta-variables
    if (ruleFromRegistry) {
      const rule = ruleFromRegistry;
      // find occurrences of rule.lhs (pattern) -> replace by instantiated rhs
      const occLHS = findPatternOccurrencesInExpr(state.goal.lhs, rule.lhs).map(x => ({ path: ['lhs', ...x.path] as Path, replaceWith: instantiate(rule.rhs, x.bindings) }));
      const occLHS_R = findPatternOccurrencesInExpr(state.goal.rhs, rule.lhs).map(x => ({ path: ['rhs', ...x.path] as Path, replaceWith: instantiate(rule.rhs, x.bindings) }));
      // find occurrences of rule.rhs -> replace by instantiated lhs
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
      const sStr = s.toString(); this.logger(`确定: simplify -> ${sStr}`);
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
  rewriteRules: Record<string, { lhs: Expr; rhs: Expr }> = DEFAULT_REWRITE_RULES;

  constructor(initialFacts: Array<{ name: string; fact: Fact }> = [], rules: Record<string, { lhs: Expr; rhs: Expr }> = DEFAULT_REWRITE_RULES) {
    for (const f of initialFacts) this.globalContext.addFact(f.name, f.fact);
    this.rewriteRules = rules;
  }
  setLogger(fn: (s: string) => void) { this.logger = fn; }

  addGlobalFact(name: string, fact: Fact, overwrite = false): { ok: boolean; message?: string } {
    if (!overwrite && this.globalContext.has(name)) return { ok: false, message: `global fact already present: ${name}` };
    if (overwrite) this.globalContext.setFact(name, fact); else this.globalContext.addFact(name, fact);
    this.logger(`Added global fact '${name}'`);
    return { ok: true };
  }

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
    const runner = new Prover(); runner.setLogger((s) => this.logger(`[frame ${frameId}] ${s}`)); runner.rewriteRules = this.rewriteRules;
    const state = { goal: frame.goal, context: frame.context };
    const ok = runner.runSingleCommandOnState(state, cmd);
    if (!ok) return { ok: false, message: 'command failed' };
    frame.commands.push(deepClone(cmd));
    return { ok: true };
  }

  finalize(frameId: string): { ok: boolean; message?: string } {
    const frame = this.frames.get(frameId); if (!frame) return { ok: false, message: 'frame not found' };
    if (frame.completed) return { ok: false, message: 'frame already completed' };
    const prover = new Prover(); prover.setLogger((s) => this.logger(`[finalize ${frameId}] ${s}`)); prover.rewriteRules = this.rewriteRules;
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

  Example: use a named rewrite rule (conj_inv) to prove conj(conj(z)) = z
  ---------------------------------------------------------------------
  import { Expr, ProofSession } from './chinese_theorem_prover';

  const sess = new ProofSession();
  sess.setLogger(console.log);

  const frameId = sess.startHave('conj_inv_proof', Expr.eq(Expr.func('conj', Expr.func('conj', Expr.var('z'))), Expr.var('z')));

  // apply the named rewrite rule 'conj_inv'
  console.log('addCommand 再写 (conj_inv):', sess.addCommand(frameId, { cmd: '再写', occurrence: 1, equalityName: 'conj_inv' }));

  // finalize the proof (goal should become z = z and thus be trivially proven)
  console.log('finalize:', sess.finalize(frameId));
  console.log('global context keys now:', sess.getGlobalContextKeys());
*/

////////////////////////
// Exports
////////////////////////
export default { Expr, Prover, Context, ProofSession, DEFAULT_REWRITE_RULES };
