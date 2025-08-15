"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var proof_session_js_1 = require("./proof-session.js");
var prover_core_js_1 = require("./prover-core.js");
console.log("=== Minimal Reproduction of Prover Failure 2 ===");
var O = prover_core_js_1.Expr.var('O');
var M = prover_core_js_1.Expr.var('M');
var A = prover_core_js_1.Expr.var('A');
var B = prover_core_js_1.Expr.var('B');
// Goal: -4*Re((O-M)*conj((A-B)/2)) = -2*Re((O-M)*conj(A-B))
var goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-4), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.div(prover_core_js_1.Expr.sub(A, B), prover_core_js_1.Expr.const(2)))))), prover_core_js_1.Expr.mul(prover_core_js_1.Expr.const(-2), prover_core_js_1.Expr.Re(prover_core_js_1.Expr.mul(prover_core_js_1.Expr.sub(O, M), prover_core_js_1.Expr.conj(prover_core_js_1.Expr.sub(A, B))))));
var session = new proof_session_js_1.ProofSession(goal, { logger: console.log });
console.log("Attempting to prove the simplification lemma with corrected rewrite steps...");
// Expand LHS
session.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_sub', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });
// Expand RHS
session.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_sub', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });
session.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });
// Now, with both sides fully expanded, the field solver should succeed.
session.runCommand({ cmd: '多能' });
if (session.isComplete()) {
    console.log("Proof succeeded!");
}
else {
    console.log("Proof failed.");
    console.log("Final Goal:", JSON.stringify(session.getGoal(), null, 2));
}
