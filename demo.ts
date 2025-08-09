import { Expr, ProofSession } from './main/index.js';
const sess = new ProofSession([
{ name: 'g', fact: Expr.neq(Expr.var('a'), Expr.const(5)) }
]);
sess.setLogger(console.log);
const frameId = sess.startHave('main_goal', Expr.neq(Expr.add(Expr.var('a'), Expr.const(1)), Expr.const(6)));
sess.addCommand(frameId, { cmd: '反证', hypName: 'g' });
// start subframe in-place
const childId = sess.startHave('subgoal', Expr.eq(Expr.sub(Expr.add(Expr.var('a'), Expr.const(1)), Expr.const(1)), Expr.const(5)), frameId);
sess.addCommand(childId, { cmd: '再写', equalityName: 'g', occurrence: 1 });
sess.addCommand(childId, { cmd: '确定' });
sess.finalize(childId);

sess.finalize(frameId);

console.log('Serialized proof:\n' + sess.serializeAll());