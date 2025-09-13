import { ProofSession } from './proof-session.js';
// Fix 1: Import Fact using 'import type' as it is a type definition.
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

// Define useful expressions for readability and reuse
const E_A_minus_B = Expr.sub(A, B);
const E_O_minus_M = Expr.sub(O, M);
const E_O_minus_A = Expr.sub(O, A);
const E_O_minus_B = Expr.sub(O, B);
const E_sqnorm_OA = Expr.sqnorm(E_O_minus_A);
const E_sqnorm_OB = Expr.sqnorm(E_O_minus_B);
const E_sqnorm_AB = Expr.sqnorm(E_A_minus_B);
const E_conj_A_minus_B = Expr.conj(E_A_minus_B);

const hypotheses: Record<string, Fact> = {
  'hd': Expr.neq(A, B), // A != B
  // hm: M is the midpoint of AB. M = (A+B)/2
  'hm': Expr.eq(M, Expr.div(Expr.add(A, B), C2)),
  // hp: O-M is perpendicular to A-B. Re((O-M)/(A-B)) = 0
  'hp': Expr.eq(Expr.Re(Expr.div(E_O_minus_M, E_A_minus_B)), C0)
};

// Goal: Distance OA equals distance OB. |O-A|^2 = |O-B|^2
const goal = Expr.eq(
  E_sqnorm_OA,
  E_sqnorm_OB
);

// Initialize the proof session
// Note: The visualization in the logs might render (A+B)/2 as (A + B / 2) due to the simple
// implementation of exprToReadableString in prover-core.ts, but the AST is correct.
const session = new ProofSession(goal, { hypotheses, logger: console.log });

// Helper function to print the current goal
const printGoal = (s: ProofSession = session) => console.log("Current Goal:", factToReadable(s.getGoal()));

// Helper function to exhaustively apply conjugate simplification rules
const simplify_conj = (s: ProofSession) => {
    let changed = true;
    // Keep applying rules until no more changes occur (normalization).
    while(changed) {
        changed = false;
        const rules = ['conj_div', 'conj_mul', 'conj_sub', 'conj_add', 'conj_neg', 'conj_inv'];
        for (const rule of rules) {
            // Apply the rule (LHS -> RHS) at the first occurrence found.
            if(s.runCommand({ cmd: '再写', equalityName: rule, occurrence: 1 })) {
                changed = true;
                break; // Restart loop after a successful rewrite to find newly exposed patterns
            }
        }
    }
}

/*
Proof Strategy Overview:
We aim to show |O-A|^2 - |O-B|^2 = 0.
We will prove two key identities:
1. Geometric Identity (using 'hm'): |O-A|^2 - |O-B|^2 = -2 * Re((O-M) * conj(A-B)).
2. Complex Algebra Identity: Re(Z*conj(W)) = Re(Z/W) * |W|^2.
Combining these and using 'hp' (which sets Re((O-M)/(A-B)) = 0) proves the goal.
This requires proving W!=0 (i.e., A-B!=0).
*/

// =================================================================
// Step 1: Prove A-B != 0. (h_AB_ne0)
// =================================================================

console.log("\n--- Step 1: Proving A-B != 0 (h_AB_ne0) ---");

// Goal: A-B != 0. Hyp: hd (A!=B).
const nested1 = session.startNestedProof(Expr.neq(E_A_minus_B, C0));

// Apply proof by contradiction (反证).
// New Goal: A=B. Assumption ('hd'): A-B=0.
nested1.runCommand({ cmd: '反证', hypName: 'hd' });

// Prove identity A = (A-B) + B to introduce A-B.
const nested1_1 = nested1.startNestedProof(Expr.eq(A, Expr.add(E_A_minus_B, B)));
nested1_1.runCommand({ cmd: '多能' });
if (!nested1_1.isComplete()) throw new Error("Failed Step 1.1");
nested1.finalizeNestedProof(nested1_1, 'h_id_A');

// Rewrite A using the identity. Goal: A=B
nested1.runCommand({ cmd: '再写', equalityName: 'h_id_A' });
// Goal: (A-B) + B = B.
// Rewrite A-B using the assumption 'hd' (A-B=0).
nested1.runCommand({ cmd: '再写', equalityName: 'hd' });
// Goal: 0 + B = B.
nested1.runCommand({ cmd: '多能' });

if (!nested1.isComplete()) throw new Error("Failed Step 1");
session.finalizeNestedProof(nested1, 'h_AB_ne0');

// =================================================================
// Step 2: Proving conj(A-B) != 0. (h_cAB_ne0)
// Required for algebraic manipulations in Step 3.
// =================================================================

console.log("\n--- Step 2: Proving conj(A-B) != 0 (h_cAB_ne0) ---");

// Goal: conj(A-B) != 0. Hyp: h_AB_ne0 (A-B != 0).
const nested2 = session.startNestedProof(Expr.neq(E_conj_A_minus_B, C0));

// Apply proof by contradiction (反证).
// New Goal: A-B = 0. Assumption ('h_AB_ne0'): conj(A-B)=0.
nested2.runCommand({ cmd: '反证', hypName: 'h_AB_ne0' });

// Fix 2: We want to rewrite A-B as conj(conj(A-B)).
// However, '再写' only applies rules L->R. 'conj_inv' is conj(conj(X))->X.
// We must first prove the identity A-B = conj(conj(A-B)).

// Prove the identity A-B = conj(conj(A-B)).
const nested2_1 = nested2.startNestedProof(Expr.eq(E_A_minus_B, Expr.conj(E_conj_A_minus_B)));
// Apply conj_inv on the RHS.
nested2_1.runCommand({ cmd: '再写', equalityName: 'conj_inv' });
// Goal: A-B = A-B. (Implicitly complete).
if (!nested2_1.isComplete()) throw new Error("Failed Step 2.1");
nested2.finalizeNestedProof(nested2_1, 'h_id_conj_inv');

// Use the proven identity h_id_conj_inv to rewrite the goal (A-B = 0).
nested2.runCommand({ cmd: '再写', equalityName: 'h_id_conj_inv' });
// Goal: conj(conj(A-B)) = 0.

// Use the assumption 'h_AB_ne0' (which is now conj(A-B)=0).
nested2.runCommand({ cmd: '再写', equalityName: 'h_AB_ne0' });
// Goal: conj(0) = 0.

// Evaluate constant expression.
nested2.runCommand({ cmd: '确定' });

if (!nested2.isComplete()) throw new Error("Failed Step 2");
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

// Strategy: Expand definitions (Re, sqnorm) and simplify algebraically.
nested3.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
nested3.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
nested3.runCommand({ cmd: '再写', equalityName: 'sqnorm_def', occurrence: 1 });

// Simplify conjugates exhaustively.
simplify_conj(nested3);

// Use '多能'. The expansion introduces variable denominators A-B and conj(A-B).
// We must provide proofs that they are non-zero.
nested3.runCommand({ cmd: '多能', denomProofs: ['h_AB_ne0', 'h_cAB_ne0'] });

if (!nested3.isComplete()) throw new Error("Failed Step 3");
session.finalizeNestedProof(nested3, 'h_Re_connection');

// =================================================================
// Step 4: Prove the Geometric Identity (h_GeometricIdentity).
// Identity: |O-A|^2 - |O-B|^2 = -2 Re((O-M)c(A-B)).
// This relies on 'hm' (M is midpoint).
// =================================================================

console.log("\n--- Step 4: Proving the Main Geometric Identity (h_GeometricIdentity) ---");

// RHS = -2 * Re(...) = 2 * (-Re(...))
const Goal4_RHS = Expr.mul(C2, Expr.neg(Expr.Re(Expr.mul(E_O_minus_M, E_conj_A_minus_B))));
const Goal4 = Expr.eq(Expr.sub(E_sqnorm_OA, E_sqnorm_OB), Goal4_RHS);

const nested4 = session.startNestedProof(Goal4);

// Strategy: Expand definitions, substitute M, and simplify algebraically.

// Expand definitions (sqnorm, Re).
nested4.runCommand({ cmd: '再写', equalityName: 'sqnorm_def', occurrence: 1 });
nested4.runCommand({ cmd: '再写', equalityName: 'sqnorm_def', occurrence: 1 });
nested4.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });

// Simplify conjugates before substitution.
simplify_conj(nested4);

// Substitute M using 'hm'. M=(A+B)/2.
// After expansion, M appears multiple times (e.g., in O-M and inside conj(O-M)).
// '再写' only substitutes one occurrence at a time. We must iterate until all M are gone,
// otherwise '多能' (which treats variables opaquely) will fail.
while(nested4.runCommand({ cmd: '再写', equalityName: 'hm', occurrence: 1 })) {}

// Simplify conjugates again after substitution (e.g. conj((A+B)/2)).
simplify_conj(nested4);

// Algebraic simplification.
nested4.runCommand({ cmd: '多能' });

if (!nested4.isComplete()) throw new Error("Failed Step 4");
session.finalizeNestedProof(nested4, 'h_GeometricIdentity');

// =================================================================
// Step 5: Finalize the main proof.
// =================================================================

console.log("\n--- Step 5: Finalizing Main Proof ---");

// We combine the proven identities and the hypothesis 'hp' to show the difference is zero.

console.log("--- Step 5.1: Proving |O-A|^2 - |O-B|^2 = 0 (h_Diff_Zero) ---");

const Goal5_1 = Expr.eq(Expr.sub(E_sqnorm_OA, E_sqnorm_OB), C0);
const nested5_1 = session.startNestedProof(Goal5_1);

// 1. Rewrite the LHS using h_GeometricIdentity.
nested5_1.runCommand({ cmd: '再写', equalityName: 'h_GeometricIdentity' });
// Goal: 2 * (-Re((O-M)c(A-B))) = 0.

// 2. Rewrite the Re(...) term using h_Re_connection.
nested5_1.runCommand({ cmd: '再写', equalityName: 'h_Re_connection' });
// Goal: 2 * (-(Re((O-M)/(A-B)) * |A-B|^2)) = 0.

// 3. Use the main hypothesis 'hp': Re((O-M)/(A-B)) = 0.
nested5_1.runCommand({ cmd: '再写', equalityName: 'hp' });
// Goal: 2 * (-(0 * |A-B|^2)) = 0.

// 4. Algebraic simplification.
nested5_1.runCommand({ cmd: '多能' });

if (!nested5_1.isComplete()) throw new Error("Failed Step 5.1");
session.finalizeNestedProof(nested5_1, 'h_Diff_Zero');


console.log("--- Step 5.2: Completing the main goal ---");
// Main Goal: |O-A|^2 = |O-B|^2.
printGoal(session);

// Prove algebraic identity X = Y + (X-Y) to allow substitution of the difference.
const Goal5_2 = Expr.eq(E_sqnorm_OA, Expr.add(E_sqnorm_OB, Expr.sub(E_sqnorm_OA, E_sqnorm_OB)));
const nested5_2 = session.startNestedProof(Goal5_2);
nested5_2.runCommand({ cmd: '多能' });
if (!nested5_2.isComplete()) throw new Error("Failed Step 5.2 Identity");
session.finalizeNestedProof(nested5_2, 'h_Id_XY');

// 1. Rewrite LHS using h_Id_XY.
session.runCommand({ cmd: '再写', equalityName: 'h_Id_XY' });
// Goal: |O-B|^2 + (|O-A|^2-|O-B|^2) = |O-B|^2.

// 2. Rewrite the difference using h_Diff_Zero.
session.runCommand({ cmd: '再写', equalityName: 'h_Diff_Zero' });
// Goal: |O-B|^2 + 0 = |O-B|^2.

// 3. Algebraic simplification.
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("\n=== ULTRA-PROPER PROOF: COMPLETE ===");
} else {
    console.log("\n=== PROOF FAILED ===");
    printGoal(session);
}
