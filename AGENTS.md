# AGENTS.md — AI Agents & Automation Guide

This repository contains the `cte-compound` Cloudflare Worker trading strategy engine, utilizing SQLite-backed Durable Objects, Workers AI, and a live OANDA integration. The certified Horizon strategy engine is protected by strict analytical parity gates, immutable checksums, and a permanent `npm run check` verification pipeline. Reliability, exact strategy restoration, and complete deterministic parity are non-negotiable.

This guide defines the rules of engagement and coding standards for all AI agents, bots, and automated pipelines operating on this codebase.

---

## 1. AI Agents & Automation Roles

### Jules
* **Role:** Primary autonomous software engineering and coding agent. Jules handles bug fixes, refactorings, feature implementations, test coverage, and documentation.
* **How to use:** Provide concrete, focused prompts with clear expectations. Prefer small, reviewable pull requests rather than sweeping codebase overhauls.
* **Expectations:**
  * Never modify or alter certified strategy logic, performance calculations, or frozen checksum files.
  * Always run `npm ci && npm run check` to verify full compatibility, syntax correctness, and strategy parity before completing any task.
  * Respect the frozen clean evidence and `REJECTED_DATA_CONTAMINATION` rules.

### cto.new
* **Role:** High-level architectural planning, technical debt identification, and multi-step improvement agent.
* **How to use:** Ask `cto.new` to surface structural or reliability gaps, draft refactoring roadmaps, or design larger cleanups.
* **Expectations:** Treat any plans or pull requests created by `cto.new` as candidate improvements that must be strictly reviewed by human owners and executed under the `npm run check` certification gate.

### Renovate
* **Role:** Automated dependency hygiene and vulnerability patching bot.
* **Expectations:**
  * Keep dependencies secure and up-to-date.
  * Group updates logically to minimize noise.
  * Dependency updates must **never** silently alter strategy numerical outputs or break the permanent check gate.
  * Prefer automerging only for clearly low-risk patch updates after all checks pass successfully.

---

## 2. Coding Standards for All Agents

All developers and automated agents must adhere to the following strict coding standards:

* **Language & Type Checking:**
  * Strict TypeScript must be enforced.
  * Use `tsc --noEmit` to verify type safety.
  * Always run `npx wrangler types` to keep `worker-configuration.d.ts` up-to-date with Env bindings (AI, Durable Objects, Fetchers).
* **Linting & Formatting:**
  * Biome (`@biomejs/biome`) is used for unified linting and formatting. Do not use separate ESLint or Prettier.
  * Run `npm run lint` (`biome check .`) to verify and fix issues.
* **Robust Code Practices:**
  * Never introduce floating promises or unhandled rejections.
  * Avoid `implicit any` or unchecked indexed access in critical paths (such as the trading ledger, order reconciliation, and Durable Object transactional state).
  * Keep code changes highly focused and modular with clear commit messages.
* **The Permanent Gate (`npm run check`):**
  * All commits and pull requests must keep `npm run check` completely green.
  * Any intentional deviation from the certified Horizon contract must be thoroughly documented in the commit/PR body and approved by the owner.

---

## 3. Agent & Human Interaction Protocols

* **Jules** is the executor of concrete codebase modifications and tests.
* **cto.new** serves as the advisor for task decomposition and system analysis.
* **Renovate** maintains dependency hygiene on a regular schedule.
* **Human Owner** retains absolute final authority over private-user trading authorization (`armed: true`), OANDA account secrets, and final certification approval.
