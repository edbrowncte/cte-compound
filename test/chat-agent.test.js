import test from "node:test";
import assert from "node:assert/strict";
import { HtlEngine } from "../src/engine-nemotron-base.js";

class MockStorage {
  constructor() {
    this.data = new Map();
  }
  async get(key) {
    if (Array.isArray(key)) {
      const res = new Map();
      for (const k of key) {
        if (this.data.has(k)) res.set(k, this.data.get(k));
      }
      return res;
    }
    return this.data.get(key);
  }
  async put(key, value) {
    if (typeof key === "object") {
      for (const [k, v] of Object.entries(key)) {
        this.data.set(k, v);
      }
      return;
    }
    this.data.set(key, value);
  }
  async delete(key) {
    if (Array.isArray(key)) {
      for (const k of key) this.data.delete(k);
      return;
    }
    this.data.delete(key);
  }
  async getAlarm() {
    return null;
  }
  async deleteAlarm() {}
}

test("Nemotron Chat Agent and Tool Loop Routing", async (t) => {
  await t.test("history retrieval and clearing works cleanly", async () => {
    const storage = new MockStorage();
    const ctx = { storage };
    const env = {
      AI: {
        run: async () => ({
          choices: [{ message: { content: "Hello! Ready to assist." } }]
        })
      }
    };

    const engine = new HtlEngine(ctx, env);

    const getRes = await engine.fetch(new Request("https://engine/chat", { method: "GET" }));
    const getData = await getRes.json();
    assert.deepEqual(getData.history, [], "History should start empty");

    const delRes = await engine.fetch(new Request("https://engine/chat", { method: "DELETE" }));
    const delData = await delRes.json();
    assert.equal(delData.ok, true, "Clear history should succeed");
  });

  await t.test("user message posting routes to AI and appends to storage", async () => {
    const storage = new MockStorage();
    const ctx = { storage };
    let runCallArgs = null;
    const env = {
      AI: {
        run: async (model, options) => {
          runCallArgs = { model, options };
          return {
            choices: [{
              message: {
                content: "I've reviewed the system, your margin is strong. Let's make trades."
              }
            }]
          };
        }
      }
    };

    const engine = new HtlEngine(ctx, env);

    const postRes = await engine.fetch(new Request("https://engine/chat", {
      method: "POST",
      body: JSON.stringify({ message: "What's our plan?", voice: false })
    }));
    const postData = await postRes.json();

    assert.equal(postRes.status, 200);
    assert.match(postData.content, /reviewed the system/, "AI response must match expectations");
    assert.equal(postData.audio, null, "Audio should be null since voice was false");

    const savedHistory = await storage.get("chat_history");
    assert.equal(savedHistory.length, 2, "Should have 2 messages in history");
    assert.equal(savedHistory[0].role, "user");
    assert.equal(savedHistory[0].content, "What's our plan?");
    assert.equal(savedHistory[1].role, "assistant");
    assert.match(savedHistory[1].content, /reviewed the system/);
  });

  await t.test("speech synthesis handles voice generation cleanly", async () => {
    const storage = new MockStorage();
    const ctx = { storage };
    let ttsCalledText = null;
    const env = {
      AI: {
        run: async (model, options) => {
          if (model === "@cf/myshell-ai/melotts") {
            ttsCalledText = options.text;
            return new Response(new Uint8Array([1, 2, 3, 4]));
          }
          return {
            choices: [{
              message: {
                content: "Sure, let's play audio."
              }
            }]
          };
        }
      }
    };

    const engine = new HtlEngine(ctx, env);

    const postRes = await engine.fetch(new Request("https://engine/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Read me a line", voice: true })
    }));
    const postData = await postRes.json();

    assert.equal(postRes.status, 200);
    assert.equal(ttsCalledText, "Sure, let's play audio.");
    assert.equal(postData.audio, btoa(String.fromCharCode(1, 2, 3, 4)), "Base64 WAV output should match mock binary");
  });
});
