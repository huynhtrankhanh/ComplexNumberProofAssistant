"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProofSession = void 0;
var prover_core_js_1 = require("./prover-core.js");
var ProofSession = /** @class */ (function () {
    function ProofSession(goal, options, parent) {
        var e_1, _a;
        if (options === void 0) { options = {}; }
        if (parent === void 0) { parent = null; }
        this.sessionId = "session_".concat(++ProofSession.sessionCounter);
        this.parent = parent;
        this.children = new Set();
        this.executedCommands = [];
        this.childProofs = new Map();
        this.logger = options.logger || (function () { });
        this.originalGoal = (0, prover_core_js_1.deepClone)(goal);
        // Initialize prover with custom rewrite rules if provided
        var rules = prover_core_js_1.DEFAULT_REWRITE_RULES;
        this.prover = new prover_core_js_1.Prover(rules);
        this.prover.setLogger(this.logger);
        // Initialize context with hypotheses
        var context = new prover_core_js_1.Context();
        if (options.hypotheses) {
            try {
                for (var _b = __values(Object.entries(options.hypotheses)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), name_1 = _d[0], fact = _d[1];
                    context.addFact(name_1, fact);
                    this.logger("Added hypothesis '".concat(name_1, "': ").concat((0, prover_core_js_1.factToReadable)(fact)));
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        // Initialize state
        this.state = {
            goal: goal,
            context: context,
            explicitCompletion: false
        };
        this.logger("Created ".concat(this.sessionId, " with goal: ").concat((0, prover_core_js_1.factToReadable)(goal)));
        // Register with parent
        if (this.parent) {
            this.parent.children.add(this);
        }
    }
    ProofSession.prototype.getOriginalGoal = function () { return (0, prover_core_js_1.deepClone)(this.originalGoal); };
    /**
     * Execute a single command in this session
     */
    ProofSession.prototype.runCommand = function (cmd) {
        if (this.state.explicitCompletion) {
            this.logger("Session ".concat(this.sessionId, " is already complete"));
            return false;
        }
        this.logger("Executing command in ".concat(this.sessionId, ": ").concat(JSON.stringify(cmd)));
        var success = this.prover.runCommand(this.state, cmd);
        // Track the executed command
        this.executedCommands.push({
            command: cmd,
            timestamp: Date.now(),
            success: success
        });
        if (success) {
            // Check if goal is now proved
            if (this.prover.checkGoalProved(this.state)) {
                this.logger("Goal proved in ".concat(this.sessionId, "!"));
            }
        }
        return success;
    };
    /**
     * Start a nested proof session to prove a sub-goal
     */
    ProofSession.prototype.startNestedProof = function (goal, options) {
        var e_2, _a;
        if (options === void 0) { options = {}; }
        // Inherit hypotheses from current context unless overridden
        var inheritedHypotheses = {};
        try {
            for (var _b = __values(this.state.context.keys()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var factName = _c.value;
                var fact = this.state.context.getFact(factName);
                if (fact) {
                    inheritedHypotheses[factName] = fact;
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        var mergedOptions = {
            hypotheses: __assign(__assign({}, inheritedHypotheses), (options.hypotheses || {})),
            logger: options.logger || this.logger
        };
        var childSession = new ProofSession(goal, mergedOptions, this);
        this.logger("Started nested proof ".concat(childSession.sessionId, " from ").concat(this.sessionId));
        return childSession;
    };
    /**
     * Finalize a completed nested proof and add its result to this session's context
     */
    ProofSession.prototype.finalizeNestedProof = function (childSession, factName) {
        if (!this.children.has(childSession)) {
            this.logger("Error: ".concat(childSession.sessionId, " is not a child of ").concat(this.sessionId));
            return false;
        }
        if (!childSession.isComplete()) {
            this.logger("Error: Child session ".concat(childSession.sessionId, " is not complete"));
            return false;
        }
        if (this.state.context.has(factName)) {
            this.logger("Error: Fact name '".concat(factName, "' already exists in context"));
            return false;
        }
        // Add the proven goal as a fact in this session's context
        var provenGoal = childSession.getOriginalGoal();
        this.state.context.addFact(factName, provenGoal);
        // Track the child proof
        this.childProofs.set(childSession, factName);
        // Remove child from active children
        this.children.delete(childSession);
        this.logger("Finalized nested proof: added '".concat(factName, "': ").concat((0, prover_core_js_1.factToReadable)(provenGoal)));
        return true;
    };
    /**
     * Check if this session's goal has been proved
     */
    ProofSession.prototype.isComplete = function () {
        return this.prover.checkGoalProved(this.state);
    };
    /**
     * Get the current goal of this session
     */
    ProofSession.prototype.getGoal = function () {
        return this.state.goal;
    };
    /**
     * Get a copy of the current context
     */
    ProofSession.prototype.getContext = function () {
        return this.state.context.clone();
    };
    /**
     * Get all facts currently in the context
     */
    ProofSession.prototype.getHypotheses = function () {
        var e_3, _a;
        var hypotheses = {};
        try {
            for (var _b = __values(this.state.context.keys()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var factName = _c.value;
                var fact = this.state.context.getFact(factName);
                if (fact) {
                    hypotheses[factName] = fact;
                }
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_3) throw e_3.error; }
        }
        return hypotheses;
    };
    /**
     * Get a specific fact from the context
     */
    ProofSession.prototype.getFact = function (name) {
        return this.state.context.getFact(name);
    };
    /**
     * Check if a fact exists in the context
     */
    ProofSession.prototype.hasFact = function (name) {
        return this.state.context.has(name);
    };
    /**
     * Get the session ID
     */
    ProofSession.prototype.getSessionId = function () {
        return this.sessionId;
    };
    /**
     * Get the parent session (null if this is the root session)
     */
    ProofSession.prototype.getParent = function () {
        return this.parent;
    };
    /**
     * Get all active child sessions
     */
    ProofSession.prototype.getChildren = function () {
        return Array.from(this.children);
    };
    /**
     * Check if this session has any active child sessions
     */
    ProofSession.prototype.hasActiveChildren = function () {
        return this.children.size > 0;
    };
    /**
     * Get the current state (mainly for debugging)
     */
    ProofSession.prototype.getState = function () {
        return {
            goal: this.state.goal,
            context: this.state.context.clone(),
            explicitCompletion: this.state.explicitCompletion
        };
    };
    /**
     * Get a summary of the session's current state
     */
    ProofSession.prototype.getSummary = function () {
        var lines = [
            "Session: ".concat(this.sessionId),
            "Goal: ".concat((0, prover_core_js_1.factToReadable)(this.state.goal)),
            "Complete: ".concat(this.isComplete()),
            "Facts: ".concat(this.state.context.keys().length),
            "Active children: ".concat(this.children.size)
        ];
        if (this.parent) {
            lines.push("Parent: ".concat(this.parent.sessionId));
        }
        return lines.join('\n');
    };
    /**
     * Clean up completed child sessions
     */
    ProofSession.prototype.cleanupCompletedChildren = function () {
        var e_4, _a;
        var cleaned = 0;
        try {
            for (var _b = __values(this.children), _c = _b.next(); !_c.done; _c = _b.next()) {
                var child = _c.value;
                if (child.isComplete() && !child.hasActiveChildren()) {
                    this.children.delete(child);
                    cleaned++;
                    this.logger("Cleaned up completed child session ".concat(child.sessionId));
                }
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_4) throw e_4.error; }
        }
        return cleaned;
    };
    ProofSession.sessionCounter = 0;
    return ProofSession;
}());
exports.ProofSession = ProofSession;
exports.default = ProofSession;
