# Dispute Resolver Primitive (GenLayer-style Consensus Logic)

A reusable **dispute resolution contract primitive** that finalizes outcomes via
**multi-validator consensus**, with clear state design, evidence windows, voting,
and a challenge period before finalization.

This repo provides an educational, standalone reference implementation in
TypeScript to demonstrate **consensus-driven resolution logic** that can be
ported into a real GenLayer Intelligent Contract environment.

---

## Why this primitive matters (beyond a one-off demo)

Many apps need a generic dispute core:
- escrow / delivery disputes
- marketplace disputes
- bounties & service-level disagreements
- content moderation disputes
- any workflow where parties disagree and a network must finalize an outcome

This primitive focuses on:
- **clear state machine**
- **evidence-based validation**
- **threshold consensus**
- **challenge window** before final locking

---

## How consensus is used

Validators independently review the dispute claim + submitted evidence and cast a vote.

Consensus rule in this implementation:
- **Supermajority threshold** (default: 2/3 of votes cast)
- If an outcome reaches threshold → dispute becomes **Resolved**
- After a **challenge window** ends → dispute becomes **Finalized**

This is stronger than “AI decides X” demos because:
- results require multi-validator agreement
- state transitions are explicit
- windows (evidence/voting/challenge) reduce manipulation

---

## State model (core design)

Each dispute has:
- Parties: `partyA`, `partyB`
- Claim reference: `claimUri` (order id / description / external pointer)
- Evidence list: `{ submitter, uri, notes, createdAtMs }[]`
- Votes list: `{ validator, outcome, rationaleUri, createdAtMs }[]`
- Status (state machine):
  - `Open` → evidence window open
  - `Voting` → validators vote
  - `Resolved` → outcome decided, challenge window open
  - `Finalized` → decision locked
- Outcome:
  - `A_WINS` / `B_WINS` / `SPLIT` (3-way outcome to support real-world disputes)

---

## Key functions

- `openDispute(...)`
- `submitEvidence(...)`
- `closeEvidenceAndStartVoting(...)`
- `castVote(...)`
- `resolve(...)` (applies supermajority threshold)
- `finalize(...)` (locks after challenge window)

---

## Run the demo

```bash
npm install
npm run dev