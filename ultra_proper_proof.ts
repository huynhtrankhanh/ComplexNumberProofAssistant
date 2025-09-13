import { ProofSession } from './proof-session.js';
import { Expr, factToReadable } from './prover-core.js';
import type { Fact } from './prover-core.js';
console.log("=== ULTRA-PROPER PROOF: START ===");

// Setup variables and initial state
const M = Expr.var('M');
const A = Expr.var('A');
const B = Expr.var('B');
const O = Expr.var('O');
const C0 = Expr.const(0);
const C2 = Expr.const(2);

const hypotheses: Record<string, Fact> = {
  'hd': Expr.neq(A, B),
  'hm': Expr.eq(M, Expr.div(Expr.add(A, B), C2)),
  // hp: O-M is perpendicular to A-B
  'hp': Expr.eq(Expr.Re(Expr.div(Expr.sub(O, M), Expr.sub(A, B))), C0)
};

// Goal: Distance OA equals distance OB
const goal = Expr.eq(
  Expr.sqnorm(Expr.sub(O, A)),
  Expr.sqnorm(Expr.sub(O, B))
);

// Initialize the proof session
const session = new ProofSession(goal, { hypotheses, logger: console.log });

// Helper function to print the current goal
const printGoal = (s: ProofSession = session) => console.log("Current Goal:", factToReadable(s.getGoal()));

// Helper function to exhaustively apply conjugate simplification rules
const simplify_conj = (s: ProofSession) => {
    let changed = true;
    // Keep applying rules until no more changes occur.
    while(changed) {
        changed = false;
        const rules = ['conj_div', 'conj_mul', 'conj_sub', 'conj_add', 'conj_neg', 'conj_inv'];
        for (const rule of rules) {
            // Apply the rule at the first occurrence found
            if(s.runCommand({ cmd: '再写', equalityName: rule })) {
                changed = true;
                break; // Restart loop after a successful rewrite to find new occurrences
            }
        }
    }
}

// Define useful expressions for readability
const E_A_minus_B = Expr.sub(A, B);
const E_O_minus_M = Expr.sub(O, M);
const E_O_minus_A = Expr.sub(O, A);
const E_O_minus_B = Expr.sub(O, B);
const E_sqnorm_OA = Expr.sqnorm(E_O_minus_A);
const E_sqnorm_OB = Expr.sqnorm(E_O_minus_B);
const E_sqnorm_AB = Expr.sqnorm(E_A_minus_B);
const E_conj_A_minus_B = Expr.conj(E_A_minus_B);

/*
The proof strategy relies on proving and combining two key identities:
1. Geometric Identity: |O-A|^2 - |O-B|^2 = -2 * Re((O-M) * conj(A-B)). (Holds if M is midpoint)
2. Complex Algebra Identity: Re(Z*conj(W)) = Re(Z/W) * |W|^2.

Combined: |O-A|^2 - |O-B|^2 = -2 * Re((O-M)/(A-B)) * |A-B|^2.
Hypothesis 'hp' makes the RHS zero, thus proving the goal.
*/

// =================================================================
// Step 1: Prove A-B != 0.
// Required as A-B is a denominator in 'hp' and needed for algebraic manipulations (多能).
// =================================================================

console.log("\n--- Step 1: Proving A-B != 0 (h_AB_ne0) ---");

// Goal: A-B != 0. Hyp: hd (A!=B).
const nested1 = session.startNestedProof(Expr.neq(E_A_minus_B, C0));

// Apply proof by contradiction (反证).
// New Goal: A=B. Assumption ('hd'): A-B=0.
nested1.runCommand({ cmd: '反证', hypName: 'hd' });

// Prove identity A = (A-B) + B.
const nested1_1 = nested1.startNestedProof(Expr.eq(A, Expr.add(E_A_minus_B, B)));
nested1_1.runCommand({ cmd: '多能' });
nested1.finalizeNestedProof(nested1_1, 'h_id_A');

// Rewrite A using the identity.
nested1.runCommand({ cmd: '再写', equalityName: 'h_id_A' });
// Goal: (A-B) + B = B.
// Rewrite A-B using the assumption 'hd'.
nested1.runCommand({ cmd: '再写', equalityName: 'hd' });
// Goal: 0 + B = B.
nested1.runCommand({ cmd: '多能' });

if (!nested1.isComplete()) throw new Error("Failed to prove h_AB_ne0");
session.finalizeNestedProof(nested1, 'h_AB_ne0');

// =================================================================
// Step 2: Proving conj(A-B) != 0.
// Required for algebraic manipulations involving division by conj(A-B).
// =================================================================

console.log("\n--- Step 2: Proving conj(A-B) != 0 (h_cAB_ne0) ---");

// Goal: conj(A-B) != 0. Hyp: h_AB_ne0 (A-B != 0).
const nested2 = session.startNestedProof(Expr.neq(E_conj_A_minus_B, C0));

// Apply proof by contradiction (反证).
// New Goal: A-B = 0. Assumption ('h_AB_ne0'): conj(A-B)=0.
nested2.runCommand({ cmd: '反证', hypName: 'h_AB_ne0' });

// Use identity A-B = conj(conj(A-B)).
nested2.runCommand({ cmd: '再写', equalityName: 'conj_inv' });
// Goal: conj(conj(A-B)) = 0.
// Use the assumption 'h_AB_ne0'.
nested2.runCommand({ cmd: '再写', equalityName: 'h_AB_ne0' });
// Goal: conj(0) = 0.
nested2.runCommand({ cmd: '确定' });

if (!nested2.isComplete()) throw new Error("Failed to prove h_cAB_ne0");
session.finalizeNestedProof(nested2, 'h_cAB_ne0');

// =================================================================
// Step 3: Prove the Complex Algebra Identity (h_Re_connection).
// Identity: Re(X*cY) = Re(X/Y) * |Y|^2.
// =================================================================

console.log("\n--- Step 3: Proving Re-Connection Identity (h_Re_connection) ---");

// Specific instance for X=O-M, Y=A-B.
const Goal3 = Expr.eq(
    Expr.Re(Expr.mul(E_O_minus_M, E_conj_A_minus_B)),
    Expr.mul(Expr.Re(Expr.div(E_O_minus_M, E_A_minus_B)), E_sqnorm_AB)
);
const nested3 = session.startNestedProof(Goal3);

// Strategy: Expand definitions and simplify algebraically.
nested3.runCommand({ cmd: '再写', equalityName: 're_def' });
nested3.runCommand({ cmd: '再写', equalityName: 're_def' });
nested3.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' });
simplify_conj(nested3);

// Use '多能'. Requires proofs that denominators (Y and cY) are non-zero.
nested3.runCommand({ cmd: '多能', denomProofs: ['h_AB_ne0', 'h_cAB_ne0'] });

if (!nested3.isComplete()) throw new Error("Failed to prove h_Re_connection");
session.finalizeNestedProof(nested3, 'h_Re_connection');

// =================================================================
// Step 4: Prove the Geometric Identity (h_GeometricIdentity).
// Identity: |O-A|^2 - |O-B|^2 = -2 Re((O-M)c(A-B)).
// =================================================================

console.log("\n--- Step 4: Proving the Main Geometric Identity (h_GeometricIdentity) ---");

// RHS = -2 * Re(...)
const Goal4_RHS = Expr.mul(C2, Expr.neg(Expr.Re(Expr.mul(E_O_minus_M, E_conj_A_minus_B))));
const Goal4 = Expr.eq(Expr.sub(E_sqnorm_OA, E_sqnorm_OB), Goal4_RHS);

const nested4 = session.startNestedProof(Goal4);

// Strategy: Expand definitions, substitute M, and simplify algebraically.

// Expand definitions (sqnorm, Re).
while(nested4.runCommand({ cmd: '再写', equalityName: 'sqnorm_def' })) {}
nested4.runCommand({ cmd: '再写', equalityName: 're_def' });
simplify_conj(nested4);

// Substitute M using 'hm'. M=(A+B)/2.
nested4.runCommand({ cmd: '再写', equalityName: 'hm' });

// Simplify conjugates again after substitution.
simplify_conj(nested4);

// Algebraic simplification.
nested4.runCommand({ cmd: '多能' });

if (!nested4.isComplete()) throw new Error("Failed to prove h_GeometricIdentity");
session.finalizeNestedProof(nested4, 'h_GeometricIdentity');

// =================================================================
// Step 5: Finalize the main proof.
// =================================================================

console.log("\n--- Step 5: Finalizing Main Proof ---");

// Prove algebraic identity X = Y + (X-Y) to allow substitution.
const Goal5 = Expr.eq(E_sqnorm_OA, Expr.add(E_sqnorm_OB, Expr.sub(E_sqnorm_OA, E_sqnorm_OB)));
const nested5 = session.startNestedProof(Goal5);
nested5.runCommand({ cmd: '多能' });
session.finalizeNestedProof(nested5, 'h_Id_XY');

// Main Goal: |O-A|^2 = |O-B|^2.
printGoal(session);

// 1. Rewrite LHS using h_Id_XY.
session.runCommand({ cmd: '再写', equalityName: 'h_Id_XY' });
// Goal: |O-B|^2 + (|O-A|^2-|O-B|^2) = |O-B|^2.

// 2. Rewrite the difference using h_GeometricIdentity.
session.runCommand({ cmd: '再写', equalityName: 'h_GeometricIdentity' });
// Goal: |O-B|^2 + (-2 Re((O-M)c(A-B))) = |O-B|^2.

// 3. Rewrite Re((O-M)c(A-B)) using h_Re_connection.
session.runCommand({ cmd: '再写', equalityName: 'h_Re_connection' });
// Goal: |O-B|^2 - 2 * (Re((O-M)/(A-B)) * |A-B|^2) = |O-B|^2.

// 4. Use the main hypothesis 'hp': Re((O-M)/(A-B)) = 0.
session.runCommand({ cmd: '再写', equalityName: 'hp' });
// Goal: |O-B|^2 - 2 * (0 * |A-B|^2) = |O-B|^2.

// 5. Algebraic simplification.
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("\n=== PROOF COMPLETE ===");
} else {
    console.log("\n=== PROOF FAILED ===");
    printGoal(session);
}
