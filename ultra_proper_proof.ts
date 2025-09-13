import { ProofSession } from './proof-session.js';
// Import Fact using 'import type' as it is a type definition.
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
// Constant used in the algebraic decomposition
const C_Neg4 = Expr.const(-4);

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
const session = new ProofSession(goal, { hypotheses, logger: console.log });

// Helper function to print the current goal
const printGoal = (s: ProofSession = session) => console.log("Current Goal:", factToReadable(s.getGoal()));

/*
Proof Strategy Overview:
We manually apply rewrite rules (再写) to normalize expressions involving conjugates before using algebraic simplification (多能).
1. Prerequisites: Prove denominators (A-B and conj(A-B)) are non-zero.
2. Complex Algebra Identity: Prove Re(Z*conj(W)) = Re(Z/W) * |W|^2.
3. Geometric Identity: Prove |O-A|^2 - |O-B|^2 = -2 * Re((O-M) * conj(A-B)). This is decomposed using algebraic lemmas (Segment Splitting).
4. Combination: Combine identities and hypothesis 'hp'.
*/

// =================================================================
// Step 1: Prove A-B != 0. (h_AB_ne0)
// =================================================================

console.log("\n--- Step 1: Proving A-B != 0 (h_AB_ne0) ---");

const nested1 = session.startNestedProof(Expr.neq(E_A_minus_B, C0));
nested1.runCommand({ cmd: '反证', hypName: 'hd' });
// New Goal: A=B. Assumption ('hd'): A-B=0.

// Prove identity A = (A-B) + B.
const nested1_1 = nested1.startNestedProof(Expr.eq(A, Expr.add(E_A_minus_B, B)));
nested1_1.runCommand({ cmd: '多能' });
if (!nested1_1.isComplete()) throw new Error("Failed Step 1.1");
nested1.finalizeNestedProof(nested1_1, 'h_id_A');

nested1.runCommand({ cmd: '再写', equalityName: 'h_id_A' });
nested1.runCommand({ cmd: '再写', equalityName: 'hd' }); // Assumption A-B=0
nested1.runCommand({ cmd: '多能' });

if (!nested1.isComplete()) throw new Error("Failed Step 1");
session.finalizeNestedProof(nested1, 'h_AB_ne0');

// =================================================================
// Step 2: Proving conj(A-B) != 0. (h_cAB_ne0)
// =================================================================

console.log("\n--- Step 2: Proving conj(A-B) != 0 (h_cAB_ne0) ---");

const nested2 = session.startNestedProof(Expr.neq(E_conj_A_minus_B, C0));
nested2.runCommand({ cmd: '反证', hypName: 'h_AB_ne0' });
// New Goal: A-B = 0. Assumption ('h_AB_ne0'): conj(A-B)=0.

// Prove the identity A-B = conj(conj(A-B)).
const nested2_1 = nested2.startNestedProof(Expr.eq(E_A_minus_B, Expr.conj(E_conj_A_minus_B)));
nested2_1.runCommand({ cmd: '再写', equalityName: 'conj_inv' }); // Apply on RHS
if (!nested2_1.isComplete()) throw new Error("Failed Step 2.1");
nested2.finalizeNestedProof(nested2_1, 'h_id_conj_inv');

nested2.runCommand({ cmd: '再写', equalityName: 'h_id_conj_inv' });
nested2.runCommand({ cmd: '再写', equalityName: 'h_AB_ne0' }); // Assumption conj(A-B)=0
nested2.runCommand({ cmd: '确定' }); // conj(0)=0

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

// Expand definitions (Re, sqnorm).
nested3.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
nested3.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
nested3.runCommand({ cmd: '再写', equalityName: 'sqnorm_def', occurrence: 1 });

// Manual normalization of conjugates.
// Let X=O-M, Y=A-B. State: (X*cY + c(X*cY))/2 = ((X/Y + c(X/Y))/2) * (Y*cY)

// 1. Normalize c(X*cY) using conj_mul -> cX*c(cY).
nested3.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });

// 2. Normalize c(X/Y) using conj_div -> cX/cY.
// Occurrence tracking: This is the first remaining conjugate after step 1.
nested3.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });

// 3. Normalize c(cY) using conj_inv -> Y.
// Occurrence tracking: This is the first remaining conjugate.
nested3.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });

// Use '多能'. Denominators are Y=(A-B) and cY=conj(A-B).
// We provide proofs matching these exact structures.
nested3.runCommand({ cmd: '多能', denomProofs: ['h_AB_ne0', 'h_cAB_ne0'] });

if (!nested3.isComplete()) throw new Error("Failed Step 3");
session.finalizeNestedProof(nested3, 'h_Re_connection');

// =================================================================
// Step 4: Prove the Geometric Identity (h_GeometricIdentity).
// Strategy: Decomposed Segment Splitting.
// =================================================================

console.log("\n--- Step 4: Proving the Main Geometric Identity (h_GeometricIdentity) ---");

// Define variables for the segment splitting strategy: X = O-M, Y = (A-B)/2.
const E_X = E_O_minus_M;
const E_Y = Expr.div(E_A_minus_B, C2);
const E_conj_Y = Expr.conj(E_Y);

// Define the target RHS and the Goal.
const Goal4_RHS = Expr.mul(C2, Expr.neg(Expr.Re(Expr.mul(E_O_minus_M, E_conj_A_minus_B))));
const Goal4 = Expr.eq(Expr.sub(E_sqnorm_OA, E_sqnorm_OB), Goal4_RHS);

// --- Step 4.1: Prove the algebraic identity |X-Y|^2 - |X+Y|^2 = -4 Re(X*cY). (h_DiffSquares) ---
console.log("--- Step 4.1: Proving h_DiffSquares ---");

const Goal4_1 = Expr.eq(
    Expr.sub(
        Expr.sqnorm(Expr.sub(E_X, E_Y)),
        Expr.sqnorm(Expr.add(E_X, E_Y))
    ),
    Expr.mul(C_Neg4, Expr.Re(Expr.mul(E_X, E_conj_Y)))
);
const nested4_1 = session.startNestedProof(Goal4_1);

// Expand definitions
// Use a loop for sqnorm_def as there are multiple occurrences.
while(nested4_1.runCommand({ cmd: '再写', equalityName: 'sqnorm_def', occurrence: 1 })) {}
nested4_1.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });

// Manual normalization.
// State: (X-Y)c(X-Y) - (X+Y)c(X+Y) = -4 * (X*cY + c(X*cY))/2

// 1. Normalize c(X-Y) using conj_sub -> cX-cY.
nested4_1.runCommand({ cmd: '再写', equalityName: 'conj_sub', occurrence: 1 });

// 2. Normalize c(X+Y) using conj_add -> cX+cY.
nested4_1.runCommand({ cmd: '再写', equalityName: 'conj_add', occurrence: 1 });

// 3. Normalize c(X*cY) using conj_mul -> cX*c(cY).
nested4_1.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });

// 4. Normalize c(cY) using conj_inv -> Y.
nested4_1.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });

// Simplify algebraically. No variable denominators.
nested4_1.runCommand({ cmd: '多能' });

if (!nested4_1.isComplete()) throw new Error("Failed Step 4.1");
session.finalizeNestedProof(nested4_1, 'h_DiffSquares');

// --- Step 4.2: Prove the connection between the RHS forms. (h_RHS_Connection) ---
// Goal: -4 Re(X*cY) = -2 Re((O-M)c(A-B)). (Where Y=(A-B)/2)
console.log("--- Step 4.2: Proving h_RHS_Connection ---");

const Goal4_2 = Expr.eq(
    Expr.mul(C_Neg4, Expr.Re(Expr.mul(E_X, E_conj_Y))),
    Goal4_RHS
);
const nested4_2 = session.startNestedProof(Goal4_2);

// Expand definitions
nested4_2.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });
nested4_2.runCommand({ cmd: '再写', equalityName: 're_def', occurrence: 1 });

// Manual normalization.
// We must normalize the conjugates thoroughly, especially handling Y=(A-B)/2.

// 1. Normalize cY=conj((A-B)/2) using conj_div -> conj(A-B)/conj(2).
// It appears in two places on the LHS (one plain, one inside another conjugate).
// We apply conj_div repeatedly until normalized.
nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });
nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });


// 2. Normalize the outer conjugates using conj_mul.
// LHS: conj(X * Z1) -> cX * conj(Z1). (Z1 = c(A-B)/c(2))
nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });
// RHS: conj(X * Z2) -> cX * conj(Z2). (Z2 = c(A-B))
nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_mul', occurrence: 1 });

// 3. Normalize the new inner conjugate on LHS using conj_div.
// LHS: conj(Z1) = conj(c(A-B)/c(2)) -> conj(c(A-B))/conj(c(2))
nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_div', occurrence: 1 });

// 4. Normalize double conjugates using conj_inv. Apply exhaustively.
let changed = true;
while (changed) {
    // Handles conj(c(A-B)), conj(c(2)), and conj(Z2).
    changed = nested4_2.runCommand({ cmd: '再写', equalityName: 'conj_inv', occurrence: 1 });
}

// Simplify algebraically. Constants like conj(2)=2 are handled correctly by the prover (多能).
nested4_2.runCommand({ cmd: '多能' });

if (!nested4_2.isComplete()) throw new Error("Failed Step 4.2");
session.finalizeNestedProof(nested4_2, 'h_RHS_Connection');

// --- Step 4.3: Establish the geometric connections using Midpoint M (hm). ---
// We need to show O-A = X-Y and O-B = X+Y.
console.log("--- Step 4.3: Establishing Geometric Connections ---");

// Lemma 4.3.1: O-A = X-Y. (h_OA_is_XmY)
const nested4_3_1 = session.startNestedProof(Expr.eq(E_O_minus_A, Expr.sub(E_X, E_Y)));
nested4_3_1.runCommand({ cmd: '再写', equalityName: 'hm'}); // Substitute M on the RHS (inside X)
nested4_3_1.runCommand({ cmd: '多能'});

if (!nested4_3_1.isComplete()) throw new Error("Failed Step 4.3.1");
session.finalizeNestedProof(nested4_3_1, 'h_OA_is_XmY');

// Lemma 4.3.2: O-B = X+Y. (h_OB_is_XpY)
const nested4_3_2 = session.startNestedProof(Expr.eq(E_O_minus_B, Expr.add(E_X, E_Y)));
nested4_3_2.runCommand({ cmd: '再写', equalityName: 'hm'}); // Substitute M on the RHS (inside X)
nested4_3_2.runCommand({ cmd: '多能'});

if (!nested4_3_2.isComplete()) throw new Error("Failed Step 4.3.2");
session.finalizeNestedProof(nested4_3_2, 'h_OB_is_XpY');

// --- Step 4.4: Combine the parts to prove the main identity (h_GeometricIdentity) ---
console.log("--- Step 4.4: Combining parts for h_GeometricIdentity ---");

const nested4_4 = session.startNestedProof(Goal4);

// 1. Rewrite O-A and O-B using the connections established in 4.3.
nested4_4.runCommand({ cmd: '再写', equalityName: 'h_OA_is_XmY' });
nested4_4.runCommand({ cmd: '再写', equalityName: 'h_OB_is_XpY' });

// 2. Rewrite LHS using the algebraic identity h_DiffSquares (4.1).
nested4_4.runCommand({ cmd: '再写', equalityName: 'h_DiffSquares' });

// 3. Rewrite LHS using the RHS connection h_RHS_Connection (4.2).
nested4_4.runCommand({ cmd: '再写', equalityName: 'h_RHS_Connection' });
// Goal: RHS = RHS. (Implicitly complete).

if (!nested4_4.isComplete()) throw new Error("Failed Step 4.4");
session.finalizeNestedProof(nested4_4, 'h_GeometricIdentity');


// =================================================================
// Step 5: Finalize the main proof.
// =================================================================

console.log("\n--- Step 5: Finalizing Main Proof ---");

console.log("--- Step 5.1: Proving |O-A|^2 - |O-B|^2 = 0 (h_Diff_Zero) ---");

const Goal5_1 = Expr.eq(Expr.sub(E_sqnorm_OA, E_sqnorm_OB), C0);
const nested5_1 = session.startNestedProof(Goal5_1);

// 1. Rewrite the LHS using h_GeometricIdentity.
nested5_1.runCommand({ cmd: '再写', equalityName: 'h_GeometricIdentity' });

// 2. Rewrite the Re(...) term using h_Re_connection (Step 3).
nested5_1.runCommand({ cmd: '再写', equalityName: 'h_Re_connection' });

// 3. Use the main hypothesis 'hp'.
nested5_1.runCommand({ cmd: '再写', equalityName: 'hp' });

// 4. Algebraic simplification.
nested5_1.runCommand({ cmd: '多能' });

if (!nested5_1.isComplete()) throw new Error("Failed Step 5.1");
session.finalizeNestedProof(nested5_1, 'h_Diff_Zero');


console.log("--- Step 5.2: Completing the main goal ---");
// Main Goal: |O-A|^2 = |O-B|^2.
printGoal(session);

// Prove algebraic identity X = Y + (X-Y).
const Goal5_2 = Expr.eq(E_sqnorm_OA, Expr.add(E_sqnorm_OB, Expr.sub(E_sqnorm_OA, E_sqnorm_OB)));
const nested5_2 = session.startNestedProof(Goal5_2);
nested5_2.runCommand({ cmd: '多能' });
if (!nested5_2.isComplete()) throw new Error("Failed Step 5.2 Identity");
session.finalizeNestedProof(nested5_2, 'h_Id_XY');

// 1. Rewrite LHS using h_Id_XY.
session.runCommand({ cmd: '再写', equalityName: 'h_Id_XY' });

// 2. Rewrite the difference using h_Diff_Zero.
session.runCommand({ cmd: '再写', equalityName: 'h_Diff_Zero' });

// 3. Algebraic simplification.
session.runCommand({ cmd: '多能' });

if (session.isComplete()) {
    console.log("\n=== ULTRA-PROPER PROOF: COMPLETE ===");
} else {
    console.log("\n=== PROOF FAILED ===");
    printGoal(session);
}
