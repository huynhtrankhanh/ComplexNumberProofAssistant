"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prover = exports.Context = exports.DEFAULT_REWRITE_RULES = exports.Expr = void 0;
exports.deepClone = deepClone;
exports.exprEquals = exprEquals;
exports.findOccurrencesInExpr = findOccurrencesInExpr;
exports.getAtPathInFact = getAtPathInFact;
exports.setAtPathInFact = setAtPathInFact;
exports.exprToMathJSStringOpaque = exprToMathJSStringOpaque;
exports.exprToMathJSStringReal = exprToMathJSStringReal;
exports.isConstantExpr = isConstantExpr;
exports.collectDenominatorsInExpr = collectDenominatorsInExpr;
exports.factToReadable = factToReadable;
exports.exprToReadableString = exprToReadableString;
exports.collectVarNames = collectVarNames;
var math = require("mathjs");
var uuid_1 = require("uuid");
var crypto_1 = require("crypto");
var runtimeNonce = (0, uuid_1.v4)() + (0, uuid_1.v4)();
var hash = function (x) { return "aa" + (0, crypto_1.createHash)("sha256").update(x + runtimeNonce).digest('hex'); };
////////////////////////
// Utilities
////////////////////////
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
function exprEquals(a, b) {
    if (a.type !== b.type)
        return false;
    switch (a.type) {
        case 'var': return b.name === a.name;
        case 'const': return b.value === a.value;
        case 'op': {
            var B = b;
            if (a.op !== B.op)
                return false;
            if (a.args.length !== B.args.length)
                return false;
            for (var i = 0; i < a.args.length; i++)
                if (!exprEquals(a.args[i], B.args[i]))
                    return false;
            return true;
        }
        case 'func': {
            var B = b;
            if (a.name !== B.name)
                return false;
            if (a.args.length !== B.args.length)
                return false;
            for (var i = 0; i < a.args.length; i++)
                if (!exprEquals(a.args[i], B.args[i]))
                    return false;
            return true;
        }
    }
}
function findOccurrencesInExpr(root, target) {
    var res = [];
    function rec(node, path) {
        if (exprEquals(node, target))
            res.push(path.slice());
        if (node.type === 'op' || node.type === 'func')
            node.args.forEach(function (ch, i) { path.push(i); rec(ch, path); path.pop(); });
    }
    rec(root, []);
    return res;
}
function getAtPathInFact(f, path) {
    var e_1, _a;
    var node = f;
    try {
        for (var path_1 = __values(path), path_1_1 = path_1.next(); !path_1_1.done; path_1_1 = path_1.next()) {
            var p = path_1_1.value;
            if (p === 'lhs')
                node = node.lhs;
            else if (p === 'rhs')
                node = node.rhs;
            else
                node = node.args[p];
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (path_1_1 && !path_1_1.done && (_a = path_1.return)) _a.call(path_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return node;
}
function setAtPathInFact(f, path, replacement) {
    var e_2, _a;
    if (path.length === 0)
        throw new Error('cannot replace the root fact directly');
    var parentPath = path.slice(0, -1);
    var last = path[path.length - 1];
    var parent = f;
    try {
        for (var parentPath_1 = __values(parentPath), parentPath_1_1 = parentPath_1.next(); !parentPath_1_1.done; parentPath_1_1 = parentPath_1.next()) {
            var p = parentPath_1_1.value;
            if (p === 'lhs')
                parent = parent.lhs;
            else if (p === 'rhs')
                parent = parent.rhs;
            else
                parent = parent.args[p];
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (parentPath_1_1 && !parentPath_1_1.done && (_a = parentPath_1.return)) _a.call(parentPath_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    if (last === 'lhs')
        parent.lhs = replacement;
    else if (last === 'rhs')
        parent.rhs = replacement;
    else
        parent.args[last] = replacement;
}
////////////////////////
// Helper function for 不利 command
////////////////////////
function canProveNonZero(expr, component) {
    // Check if component appears in expr in a way that it must be non-zero
    // given that expr ≠ 0
    var e_3, _a;
    if (exprEquals(expr, component)) {
        // The entire expression equals the component, so yes
        return true;
    }
    if (expr.type === 'op') {
        if (expr.op === 'mul') {
            try {
                // If product ≠ 0, all factors must be ≠ 0
                for (var _b = __values(expr.args), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var arg = _c.value;
                    if (canProveNonZero(arg, component))
                        return true;
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_3) throw e_3.error; }
            }
        }
        else if (expr.op === 'div') {
            // If quotient ≠ 0, both numerator and denominator must be ≠ 0
            if (canProveNonZero(expr.args[0], component))
                return true;
            if (canProveNonZero(expr.args[1], component))
                return true;
        }
        else if (expr.op === 'neg') {
            // If -x ≠ 0, then x ≠ 0
            return canProveNonZero(expr.args[0], component);
        }
        // For add/sub, we can't deduce individual terms are non-zero
    }
    else if (expr.type === 'func') {
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
exports.Expr = {
    var: function (name) { return ({ type: 'var', name: name }); },
    const: function (v) { return ({ type: 'const', value: v }); },
    add: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return ({ type: 'op', op: 'add', args: args });
    },
    sub: function (a, b) { return ({ type: 'op', op: 'sub', args: [a, b] }); },
    mul: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return ({ type: 'op', op: 'mul', args: args });
    },
    div: function (a, b) { return ({ type: 'op', op: 'div', args: [a, b] }); },
    neg: function (a) { return ({ type: 'op', op: 'neg', args: [a] }); },
    pow: function (a, b) { return ({ type: 'op', op: 'pow', args: [a, b] }); },
    func: function (name) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return ({ type: 'func', name: name, args: args });
    },
    conj: function (x) { return exports.Expr.func('conj', x); },
    Re: function (x) { return exports.Expr.func('Re', x); },
    Im: function (x) { return exports.Expr.func('Im', x); },
    sqnorm: function (x) { return exports.Expr.func('sqnorm', x); },
    eq: function (a, b) { return ({ kind: 'eq', lhs: a, rhs: b }); },
    neq: function (a, b) { return ({ kind: 'neq', lhs: a, rhs: b }); },
};
////////////////////////
// mathjs conversion: two variants
////////////////////////
var OPAQUE_FUNC_MAP = { conj: 'F_CONJ', Re: 'F_RE', Im: 'F_IM', sqnorm: 'F_SQNORM' };
function exprToMathJSStringOpaque(expr) {
    switch (expr.type) {
        case 'var': return expr.name;
        case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
        case 'op': {
            if (expr.op === 'add')
                return "(" + expr.args.map(exprToMathJSStringOpaque).join(' + ') + ")";
            if (expr.op === 'sub')
                return "(".concat(exprToMathJSStringOpaque(expr.args[0]), " - ").concat(exprToMathJSStringOpaque(expr.args[1]), ")");
            if (expr.op === 'mul')
                return "(" + expr.args.map(function (a) { return "(".concat(exprToMathJSStringOpaque(a), ")"); }).join(' * ') + ")";
            if (expr.op === 'div')
                return "(".concat(exprToMathJSStringOpaque(expr.args[0]), " / ").concat(exprToMathJSStringOpaque(expr.args[1]), ")");
            if (expr.op === 'neg')
                return "(-".concat(exprToMathJSStringOpaque(expr.args[0]), ")");
            if (expr.op === 'pow')
                return "(".concat(exprToMathJSStringOpaque(expr.args[0]), " ^ ").concat(exprToMathJSStringOpaque(expr.args[1]), ")");
            return (function (x) { return x; })(expr.op);
        }
        case 'func': {
            var fname = OPAQUE_FUNC_MAP[expr.name] || expr.name;
            return hash("".concat(fname, "(").concat(expr.args.map(exprToMathJSStringOpaque).join(','), ")"));
        }
    }
}
function exprToMathJSStringReal(expr) {
    switch (expr.type) {
        case 'var': return expr.name;
        case 'const': return (typeof expr.value === 'number') ? String(expr.value) : String(expr.value);
        case 'op': {
            if (expr.op === 'add')
                return "(" + expr.args.map(exprToMathJSStringReal).join(' + ') + ")";
            if (expr.op === 'sub')
                return "(".concat(exprToMathJSStringReal(expr.args[0]), " - ").concat(exprToMathJSStringReal(expr.args[1]), ")");
            if (expr.op === 'mul')
                return "(" + expr.args.map(function (a) { return "(".concat(exprToMathJSStringReal(a), ")"); }).join(' * ') + ")";
            if (expr.op === 'div')
                return "(".concat(exprToMathJSStringReal(expr.args[0]), " / ").concat(exprToMathJSStringReal(expr.args[1]), ")");
            if (expr.op === 'neg')
                return "(-".concat(exprToMathJSStringReal(expr.args[0]), ")");
            if (expr.op === 'pow')
                return "(".concat(exprToMathJSStringReal(expr.args[0]), " ^ ").concat(exprToMathJSStringReal(expr.args[1]), ")");
            return (function (x) { return x; })(expr.op);
        }
        case 'func': {
            var argStrs = expr.args.map(exprToMathJSStringReal);
            if (expr.name === 'conj')
                return "conj(".concat(argStrs.join(','), ")");
            if (expr.name === 'Re')
                return "re(".concat(argStrs.join(','), ")");
            if (expr.name === 'Im')
                return "im(".concat(argStrs.join(','), ")");
            if (expr.name === 'sqnorm') {
                var a = argStrs[0];
                return "(".concat(a, " * conj(").concat(a, "))");
            }
            return "".concat(expr.name, "(").concat(argStrs.join(','), ")");
        }
    }
}
function isConstantExpr(e) {
    if (e.type === 'const')
        return true;
    if (e.type === 'var')
        return false;
    if (e.type === 'op' || e.type === 'func')
        return e.args.every(isConstantExpr);
    return false;
}
function collectDenominatorsInExpr(expr) {
    var dens = [];
    function rec(node) {
        if (node.type === 'op') {
            if (node.op === 'div') {
                dens.push(node.args[1]);
                rec(node.args[0]);
                rec(node.args[1]);
            }
            else
                node.args.forEach(rec);
        }
        else if (node.type === 'func')
            node.args.forEach(rec);
    }
    rec(expr);
    return dens;
}
////////////////////////
// Pattern matching utilities for rewrite rules
////////////////////////
function isPatternVar(v) { return v.name.length > 0 && (v.name[0] === '?' || v.name[0] === '$'); }
function patternMatch(pattern, node, bindings) {
    if (pattern.type === 'var' && isPatternVar(pattern)) {
        var key = pattern.name;
        if (bindings[key])
            return exprEquals(bindings[key], node);
        bindings[key] = deepClone(node);
        return true;
    }
    if (pattern.type !== node.type)
        return false;
    if (pattern.type === 'const')
        return node.value === pattern.value;
    if (pattern.type === 'var')
        return pattern.name === node.name;
    if (pattern.type === 'op') {
        var p = pattern;
        var n = node;
        if (p.op !== n.op)
            return false;
        if (p.args.length !== n.args.length)
            return false;
        for (var i = 0; i < p.args.length; i++)
            if (!patternMatch(p.args[i], n.args[i], bindings))
                return false;
        return true;
    }
    if (pattern.type === 'func') {
        var p = pattern;
        var n = node;
        if (p.name !== n.name)
            return false;
        if (p.args.length !== n.args.length)
            return false;
        for (var i = 0; i < p.args.length; i++)
            if (!patternMatch(p.args[i], n.args[i], bindings))
                return false;
        return true;
    }
    return false;
}
function instantiate(pattern, bindings) {
    if (pattern.type === 'var' && isPatternVar(pattern)) {
        var b = bindings[pattern.name];
        if (!b)
            throw new Error("unbound pattern variable ".concat(pattern.name));
        return deepClone(b);
    }
    if (pattern.type === 'var' || pattern.type === 'const')
        return deepClone(pattern);
    if (pattern.type === 'op')
        return { type: 'op', op: pattern.op, args: pattern.args.map(function (a) { return instantiate(a, bindings); }) };
    return { type: 'func', name: pattern.name, args: pattern.args.map(function (a) { return instantiate(a, bindings); }) };
}
function findPatternOccurrencesInExpr(root, pattern) {
    var res = [];
    function rec(node, path) {
        var bindings = {};
        if (patternMatch(pattern, node, bindings))
            res.push({ path: path.slice(), bindings: bindings });
        if (node.type === 'op' || node.type === 'func')
            node.args.forEach(function (ch, i) { path.push(i); rec(ch, path); path.pop(); });
    }
    rec(root, []);
    return res;
}
////////////////////////
// Default named rewrite rules
////////////////////////
exports.DEFAULT_REWRITE_RULES = {
    conj_inv: { lhs: exports.Expr.func('conj', exports.Expr.func('conj', exports.Expr.var('?a'))), rhs: exports.Expr.var('?a') },
    conj_add: { lhs: exports.Expr.func('conj', exports.Expr.add(exports.Expr.var('?a'), exports.Expr.var('?b'))), rhs: exports.Expr.add(exports.Expr.func('conj', exports.Expr.var('?a')), exports.Expr.func('conj', exports.Expr.var('?b'))) },
    conj_mul: { lhs: exports.Expr.func('conj', exports.Expr.mul(exports.Expr.var('?a'), exports.Expr.var('?b'))), rhs: exports.Expr.mul(exports.Expr.func('conj', exports.Expr.var('?a')), exports.Expr.func('conj', exports.Expr.var('?b'))) },
    conj_sub: { lhs: exports.Expr.func('conj', exports.Expr.sub(exports.Expr.var('?a'), exports.Expr.var('?b'))), rhs: exports.Expr.sub(exports.Expr.func('conj', exports.Expr.var('?a')), exports.Expr.func('conj', exports.Expr.var('?b'))) },
    conj_div: { lhs: exports.Expr.func('conj', exports.Expr.div(exports.Expr.var('?a'), exports.Expr.var('?b'))), rhs: exports.Expr.div(exports.Expr.func('conj', exports.Expr.var('?a')), exports.Expr.func('conj', exports.Expr.var('?b'))) },
    conj_neg: { lhs: exports.Expr.func('conj', exports.Expr.neg(exports.Expr.var('?a'))), rhs: exports.Expr.neg(exports.Expr.func('conj', exports.Expr.var('?a'))) },
    sqnorm_def: { lhs: exports.Expr.func('sqnorm', exports.Expr.var('?a')), rhs: exports.Expr.mul(exports.Expr.var('?a'), exports.Expr.func('conj', exports.Expr.var('?a'))) },
    re_def: { lhs: exports.Expr.func('Re', exports.Expr.var('?a')), rhs: exports.Expr.div(exports.Expr.add(exports.Expr.var('?a'), exports.Expr.func('conj', exports.Expr.var('?a'))), exports.Expr.const(2)) },
    im_def: { lhs: exports.Expr.func('Im', exports.Expr.var('?a')), rhs: exports.Expr.div(exports.Expr.sub(exports.Expr.var('?a'), exports.Expr.func('conj', exports.Expr.var('?a'))), exports.Expr.const(2)) },
    i_square: { lhs: exports.Expr.mul(exports.Expr.var('i'), exports.Expr.var('i')), rhs: exports.Expr.const(-1) },
};
////////////////////////
// Context
////////////////////////
var Context = /** @class */ (function () {
    function Context() {
        this.map = new Map();
    }
    Context.prototype.clone = function () {
        var e_4, _a;
        var c = new Context();
        try {
            for (var _b = __values(this.map.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), k = _d[0], v = _d[1];
                c.map.set(k, deepClone(v));
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_4) throw e_4.error; }
        }
        return c;
    };
    Context.prototype.addFact = function (name, fact) { if (this.map.has(name))
        throw new Error("fact name already present: ".concat(name)); this.map.set(name, deepClone(fact)); };
    Context.prototype.setFact = function (name, fact) { this.map.set(name, deepClone(fact)); };
    Context.prototype.getFact = function (name) { return this.map.get(name); };
    Context.prototype.has = function (name) { return this.map.has(name); };
    Context.prototype.keys = function () { return Array.from(this.map.keys()); };
    return Context;
}());
exports.Context = Context;
////////////////////////
// Prover (core command implementations)
////////////////////////
var Prover = /** @class */ (function () {
    function Prover(rules) {
        if (rules === void 0) { rules = exports.DEFAULT_REWRITE_RULES; }
        this.logger = function () { };
        this.rewriteRules = rules;
    }
    Prover.prototype.setLogger = function (fn) { this.logger = fn; };
    Prover.prototype.runCommand = function (state, cmd) {
        if (state.explicitCompletion) {
            this.logger("proof complete for frame, no more steps accepted");
            return false;
        }
        switch (cmd.cmd) {
            case '不利': return this._cmd_buli(state, cmd);
            case '多能': return this._cmd_duoneng(state, cmd);
            case '反证': return this._cmd_fanzheng(state, cmd);
            case '再写': return this._cmd_rewrite(state, cmd);
            case '重反': return this._cmd_reverse(state, cmd);
            case '确定': return this._cmd_certain(state, cmd);
            default: throw new Error("Unknown command: ".concat(cmd.cmd));
        }
    };
    Prover.prototype._cmd_buli = function (state, cmd) {
        var hyp = state.context.getFact(cmd.hypothesis);
        if (!hyp) {
            this.logger("hypothesis not found: ".concat(cmd.hypothesis));
            return false;
        }
        if (hyp.kind !== 'neq') {
            this.logger('不利 expects hypothesis of kind neq');
            return false;
        }
        // Check if hypothesis is of form expr ≠ 0
        var isZero = hyp.rhs.type === 'const' && (hyp.rhs.value === 0 || hyp.rhs.value === '0');
        if (!isZero) {
            this.logger("\u4E0D\u5229: right hand side of \u2260 is not 0");
            return false;
        }
        // New behavior: if hypothesis is expr ≠ 0, check if component must be non-zero
        if (!canProveNonZero(hyp.lhs, cmd.component)) {
            this.logger("\u4E0D\u5229: cannot prove ".concat(exprToReadableString(cmd.component), " \u2260 0 from ").concat(exprToReadableString(hyp.lhs), " \u2260 0"));
            return false;
        }
        // Create the fact: component ≠ 0
        var newFact = { kind: 'neq', lhs: deepClone(cmd.component), rhs: exports.Expr.const(0) };
        state.context.addFact(cmd.newName, newFact);
        this.logger("Added non-equal fact '".concat(cmd.newName, "': ").concat(factToReadable(newFact)));
        return true;
    };
    Prover.prototype._cmd_duoneng = function (state, cmd) {
        var e_5, _a, e_6, _b, e_7, _c;
        var goal = state.goal;
        if (goal.kind !== 'eq') {
            this.logger('多能 currently only supports equality goals');
            return false;
        }
        var dens = collectDenominatorsInExpr(goal.lhs).concat(collectDenominatorsInExpr(goal.rhs));
        var needed = dens.filter(function (d) { return !isConstantExpr(d); });
        var supplied = new Set(cmd.denomProofs || []);
        try {
            for (var supplied_1 = __values(supplied), supplied_1_1 = supplied_1.next(); !supplied_1_1.done; supplied_1_1 = supplied_1.next()) {
                var name_1 = supplied_1_1.value;
                var f = state.context.getFact(name_1);
                if (!f) {
                    this.logger("denominator proof not found: ".concat(name_1));
                    return false;
                }
                if (f.kind !== 'neq') {
                    this.logger("denominator proof '".concat(name_1, "' must be an inequality"));
                    return false;
                }
                if (!(f.rhs.type === 'const' && f.rhs.value === 0)) {
                    this.logger("denominator proof '".concat(name_1, "' must prove denom \u2260 0"));
                    return false;
                }
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (supplied_1_1 && !supplied_1_1.done && (_a = supplied_1.return)) _a.call(supplied_1);
            }
            finally { if (e_5) throw e_5.error; }
        }
        try {
            for (var needed_1 = __values(needed), needed_1_1 = needed_1.next(); !needed_1_1.done; needed_1_1 = needed_1.next()) {
                var d = needed_1_1.value;
                var matched = false;
                try {
                    for (var supplied_2 = (e_7 = void 0, __values(supplied)), supplied_2_1 = supplied_2.next(); !supplied_2_1.done; supplied_2_1 = supplied_2.next()) {
                        var name_2 = supplied_2_1.value;
                        var f = state.context.getFact(name_2);
                        if (exprEquals(f.lhs, d)) {
                            matched = true;
                            break;
                        }
                    }
                }
                catch (e_7_1) { e_7 = { error: e_7_1 }; }
                finally {
                    try {
                        if (supplied_2_1 && !supplied_2_1.done && (_c = supplied_2.return)) _c.call(supplied_2);
                    }
                    finally { if (e_7) throw e_7.error; }
                }
                if (!matched) {
                    this.logger('A denominator was not proven non-zero: ' + exprToReadableString(d));
                    return false;
                }
            }
        }
        catch (e_6_1) { e_6 = { error: e_6_1 }; }
        finally {
            try {
                if (needed_1_1 && !needed_1_1.done && (_b = needed_1.return)) _b.call(needed_1);
            }
            finally { if (e_6) throw e_6.error; }
        }
        var diff = "(".concat(exprToMathJSStringOpaque(goal.lhs), ") - (").concat(exprToMathJSStringOpaque(goal.rhs), ")");
        console.log("original expression", diff);
        try {
            var s = math.simplify(math.rationalize(math.simplify(diff)));
            var sStr = s.toString();
            this.logger("math.simplify -> ".concat(sStr));
            if (sStr === '0' || sStr === '0.0') {
                state.explicitCompletion = true;
                this.logger("frame complete");
                return true;
            }
            this.logger("多能 simplify failed, can't prove with field axioms");
            console.log(s.toString());
            return false;
        }
        catch (e) {
            this.logger('多能 simplify failed: ' + e.message);
            return false;
        }
    };
    Prover.prototype._cmd_fanzheng = function (state, cmd) {
        var h = state.context.getFact(cmd.hypName);
        if (!h) {
            this.logger("\u53CD\u8BC1: fact not found ".concat(cmd.hypName));
            return false;
        }
        if (h.kind !== 'neq') {
            this.logger('反证 expects a non-equality (neq) hypothesis');
            return false;
        }
        if (state.goal.kind !== 'neq') {
            this.logger('反证 expects the current goal to be an inequality (neq)');
            return false;
        }
        var newEq = { kind: 'eq', lhs: deepClone(state.goal.lhs), rhs: deepClone(state.goal.rhs) };
        state.context.setFact(cmd.hypName, newEq); // overwrite hypothesis
        state.goal = { kind: 'eq', lhs: deepClone(h.lhs), rhs: deepClone(h.rhs) };
        this.logger("\u53CD\u8BC1 applied: replaced '".concat(cmd.hypName, "' with ").concat(factToReadable(newEq), "; new goal ").concat(factToReadable(state.goal)));
        return true;
    };
    Prover.prototype._cmd_rewrite = function (state, cmd) {
        var ruleName = cmd.equalityName;
        var ruleFromContext = state.context.getFact(ruleName);
        var isContextEq = !!(ruleFromContext && ruleFromContext.kind === 'eq');
        var ruleFromRegistry = (this.rewriteRules && this.rewriteRules[ruleName]);
        if (!isContextEq && !ruleFromRegistry) {
            this.logger("\u518D\u5199: neither equality fact nor rewrite rule named '".concat(ruleName, "' found"));
            return false;
        }
        var occurrences = [];
        if (isContextEq) {
            var f_1 = ruleFromContext;
            var occA = findOccurrencesInExpr(state.goal.lhs, f_1.lhs).map(function (p) { return ({ path: __spreadArray(['lhs'], __read(p), false), replaceWith: deepClone(f_1.rhs) }); });
            var occAonR = findOccurrencesInExpr(state.goal.rhs, f_1.lhs).map(function (p) { return ({ path: __spreadArray(['rhs'], __read(p), false), replaceWith: deepClone(f_1.rhs) }); });
            var occB = findOccurrencesInExpr(state.goal.lhs, f_1.rhs).map(function (p) { return ({ path: __spreadArray(['lhs'], __read(p), false), replaceWith: deepClone(f_1.lhs) }); });
            var occBonR = findOccurrencesInExpr(state.goal.rhs, f_1.rhs).map(function (p) { return ({ path: __spreadArray(['rhs'], __read(p), false), replaceWith: deepClone(f_1.lhs) }); });
            occurrences.push.apply(occurrences, __spreadArray(__spreadArray(__spreadArray(__spreadArray([], __read(occA), false), __read(occAonR), false), __read(occB), false), __read(occBonR), false));
        }
        if (ruleFromRegistry) {
            var rule_1 = ruleFromRegistry;
            var occLHS = findPatternOccurrencesInExpr(state.goal.lhs, rule_1.lhs).map(function (x) { return ({ path: __spreadArray(['lhs'], __read(x.path), false), replaceWith: instantiate(rule_1.rhs, x.bindings) }); });
            var occLHS_R = findPatternOccurrencesInExpr(state.goal.rhs, rule_1.lhs).map(function (x) { return ({ path: __spreadArray(['rhs'], __read(x.path), false), replaceWith: instantiate(rule_1.rhs, x.bindings) }); });
            var occRHS = findPatternOccurrencesInExpr(state.goal.lhs, rule_1.rhs).map(function (x) { return ({ path: __spreadArray(['lhs'], __read(x.path), false), replaceWith: instantiate(rule_1.lhs, x.bindings) }); });
            var occRHS_R = findPatternOccurrencesInExpr(state.goal.rhs, rule_1.rhs).map(function (x) { return ({ path: __spreadArray(['rhs'], __read(x.path), false), replaceWith: instantiate(rule_1.lhs, x.bindings) }); });
            occurrences.push.apply(occurrences, __spreadArray(__spreadArray(__spreadArray(__spreadArray([], __read(occLHS), false), __read(occLHS_R), false), __read(occRHS), false), __read(occRHS_R), false));
        }
        if (occurrences.length < (cmd.occurrence || 1)) {
            this.logger('再写: occurrence not found');
            return false;
        }
        var chosen = occurrences[(cmd.occurrence || 1) - 1];
        setAtPathInFact(state.goal, chosen.path, deepClone(chosen.replaceWith));
        this.logger("\u518D\u5199 applied at occurrence ".concat(cmd.occurrence, " using ").concat(ruleName));
        return true;
    };
    Prover.prototype._cmd_reverse = function (state, cmd) {
        var f = state.context.getFact(cmd.oldName);
        if (!f) {
            this.logger("\u91CD\u53CD: fact not found ".concat(cmd.oldName));
            return false;
        }
        if (f.kind !== 'eq') {
            this.logger('重反 expects an equality fact');
            return false;
        }
        var newFact = { kind: 'eq', lhs: deepClone(f.rhs), rhs: deepClone(f.lhs) };
        state.context.addFact(cmd.newName, newFact);
        this.logger("\u91CD\u53CD: added ".concat(cmd.newName, " = ").concat(factToReadable(newFact)));
        return true;
    };
    Prover.prototype._cmd_certain = function (state, _cmd) {
        var goal = state.goal;
        if (goal.kind !== 'eq') {
            this.logger('确定 expects an equality goal');
            return false;
        }
        if (!isConstantExpr(goal.lhs) || !isConstantExpr(goal.rhs)) {
            this.logger('确定: not both sides constant');
            return false;
        }
        try {
            var diff = "(".concat(exprToMathJSStringReal(goal.lhs), ") - (").concat(exprToMathJSStringReal(goal.rhs), ")");
            var s = math.simplify(diff);
            var sStr = s.toString();
            this.logger("\u786E\u5B9A: simplify -> ".concat(sStr));
            if (sStr === '0' || sStr === '0.0') {
                this.logger("frame complete");
                state.explicitCompletion = true;
                return true;
            }
            return false;
        }
        catch (e) {
            this.logger('确定 simplify failed: ' + e.message);
            return false;
        }
    };
    Prover.prototype.checkGoalProved = function (state) {
        var e_8, _a, e_9, _b;
        if (state.explicitCompletion) {
            console.log("hooray! it's an explicit completion");
            return true;
        }
        if (state.goal.kind === 'eq') {
            if (exprEquals(state.goal.lhs, state.goal.rhs))
                return true;
            try {
                for (var _c = __values(state.context.keys()), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var k = _d.value;
                    var f = state.context.getFact(k);
                    if (f.kind === 'eq' && exprEquals(f.lhs, state.goal.lhs) && exprEquals(f.rhs, state.goal.rhs))
                        return true;
                }
            }
            catch (e_8_1) { e_8 = { error: e_8_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_8) throw e_8.error; }
            }
            return false;
        }
        if (state.goal.kind === 'neq') {
            try {
                for (var _e = __values(state.context.keys()), _f = _e.next(); !_f.done; _f = _e.next()) {
                    var k = _f.value;
                    var f = state.context.getFact(k);
                    if (f.kind === 'neq' && exprEquals(f.lhs, state.goal.lhs) && exprEquals(f.rhs, state.goal.rhs))
                        return true;
                }
            }
            catch (e_9_1) { e_9 = { error: e_9_1 }; }
            finally {
                try {
                    if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
                }
                finally { if (e_9) throw e_9.error; }
            }
            return false;
        }
        return false;
    };
    return Prover;
}());
exports.Prover = Prover;
////////////////////////
// Helpers & Readable
////////////////////////
function factToReadable(f) { return f.kind === 'eq' ? "".concat(exprToReadableString(f.lhs), " = ").concat(exprToReadableString(f.rhs)) : "".concat(exprToReadableString(f.lhs), " \u2260 ").concat(exprToReadableString(f.rhs)); }
function exprToReadableString(e) {
    if (e.type === 'var')
        return e.name;
    if (e.type === 'const')
        return String(e.value);
    if (e.type === 'op') {
        if (e.op === 'add')
            return e.args.map(exprToReadableString).join(' + ');
        if (e.op === 'mul')
            return e.args.map(exprToReadableString).join(' * ');
        if (e.op === 'div')
            return "(".concat(exprToReadableString(e.args[0]), " / ").concat(exprToReadableString(e.args[1]), ")");
        if (e.op === 'sub')
            return "(".concat(exprToReadableString(e.args[0]), " - ").concat(exprToReadableString(e.args[1]), ")");
        if (e.op === 'neg')
            return "(-".concat(exprToReadableString(e.args[0]), ")");
    }
    if (e.type === 'func')
        return "".concat(e.name, "(").concat(e.args.map(exprToReadableString).join(','), ")");
    return JSON.stringify(e);
}
function collectVarNames(f) { var s = new Set(); function rec(n) { if (n.type === 'var')
    s.add(n.name);
else if (n.type === 'op' || n.type === 'func')
    n.args.forEach(rec); } rec(f.lhs); rec(f.rhs); return __spreadArray([], __read(s), false); }
////////////////////////
// Exports
////////////////////////
exports.default = { Expr: exports.Expr, Prover: Prover, Context: Context, DEFAULT_REWRITE_RULES: exports.DEFAULT_REWRITE_RULES };
