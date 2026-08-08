import test from "node:test";
import assert from "node:assert/strict";
import {__masImTest} from "../src/mas-im-calculator.js";

test("five-observation MAS/IM ROC measures acceleration instead of collapsing to zero",()=>{
  const rising=__masImTest.roc([0.10,0.14,0.21,0.31,0.46],5);
  const falling=__masImTest.roc([0.46,0.31,0.21,0.14,0.10],5);
  assert.ok(rising>0,`expected positive ROC, received ${rising}`);
  assert.ok(falling<0,`expected negative ROC, received ${falling}`);
  assert.ok(Math.abs(rising+falling)<1e-12);
});
