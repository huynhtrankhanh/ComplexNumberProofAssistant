"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var proof_session_js_1 = require("./proof-session.js");
var prover_core_js_1 = require("./prover-core.js");
console.log("=== Minimal Reproduction of Prover Failure ===");
var z = prover_core_js_1.Expr.var('z');
// Goal: Re(z/2) = Re(z)/2
var goal = prover_core_js_1.Expr.eq(prover_core_js_1.Expr.Re(prover_core_js_1.Expr.div(z, prover_core_js_1.Expr.const(2))), prover_core_js_1.Expr.div(prover_core_js_1.Expr.Re(z), prover_core_js_1.Expr.const(2)));
var session = new proof_session_js_1.ProofSession(goal, { logger: console.log });
console.log("Attempting to prove: Re(z/2) = Re(z)/2");
// Expand both sides of the equation using the definition of Re
session.runCommand({ cmd: '再写', equalityName: 're_def' });
session.runCommand({ cmd: '再写', equalityName: 're_def' });
// Simplify the conj expression on the LHS
session.runCommand({ cmd: '再写', equalityName: 'conj_div' });
// At this point, the two sides are algebraically identical.
// LHS: (z/2 + conj(z)/2) / 2
// RHS: ((z + conj(z)) / 2) / 2
// The 多能 command should be able to simplify this.
session.runCommand({ cmd: '多能' });
if (session.isComplete()) {
    console.log("Proof succeeded!");
}
else {
    console.log("Proof failed as expected.");
    console.log("Final Goal:", JSON.stringify(session.getGoal(), null, 2));
}
