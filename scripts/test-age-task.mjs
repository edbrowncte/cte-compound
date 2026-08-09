import assert from "node:assert/strict";
import fs from "node:fs";
import {__nemotronTest} from "../src/engine-nemotron-base.js";

const html=fs.readFileSync("public/index.html","utf8");
const engine=fs.readFileSync("src/engine-nemotron-base.js","utf8");

assert.equal(__nemotronTest.AI_TASK_NAME,"AGE");
assert.equal(__nemotronTest.AI_TASK,"ADMINISTRATING_GREAT_EXPECTATIONS");
assert.equal(__nemotronTest.AI_POLICY,"CAPITALIZATION_NEW_ENTRY_DISCRETION");
assert.match(html,/AGE · Administrating Great Expectations/);
assert.match(html,/AGE \(Administrating Great Expectations\)/);
assert.match(engine,/AGE continuously compares the expected continuation or subsequent reversal value of capital already occupied in positions against the best currently qualified alternatives/);
assert.match(engine,/task:"AGE_ADMINISTRATING_GREAT_EXPECTATIONS_NEW_ENTRY_SELECTION"/);
assert.match(engine,/taskName:AI_TASK_NAME,task:AI_TASK/);
assert.match(engine,/Never invent a pair, change direction, alter units or risk controls, close\/reverse positions, or change configuration/);

console.log("AGE (Administrating Great Expectations) is the named Nemotron capitalization task while bounded execution authority remains intact.");
