# Dispute Resolver Primitive (GenLayer-style Consensus Logic)

A reusable **dispute resolution contract primitive** that finalizes outcomes via
**multi-validator consensus**, with clear state design, evidence windows, voting,
and a challenge period before finalization.

This repository contains a deployed GenLayer Intelligent Contract implementation
of a reusable dispute resolution primitive.

The main on-chain implementation is:
`contracts/dispute_resolver.py`

The contract uses explicit state transitions, evidence submission,
validator-based consensus, a challenge window, and finalization.

### Deployed GenLayer Contract

- Network: GenLayer Studio
- Contract: `dispute_resolver.py`
- Address: `0x779A72354d232f32670e31b7b71Db6E915A8054D`
- Explorer:
  https://explorer-studio.genlayer.com/address/0x779A72354d232f32670e31b7b71Db6E915A8054D

The TypeScript files in `src/` provide a reference/demo implementation,
while `contracts/dispute_resolver.py` is the GenLayer Intelligent Contract
used for deployment.

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

The contract uses GenLayer's nondeterministic execution and validator
equivalence checking to evaluate the dispute claim and submitted evidence.

The `resolve(...)` method:
- generates an evidence-grounded proposed outcome
- independently validates the proposed outcome
- accepts only a valid matching outcome
- transitions the dispute to **Resolved**

After the challenge window ends, `finalize(...)` transitions the dispute
to **Finalized**.

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

- `open_dispute(...)` — creates a dispute and opens the evidence window
- `submit_evidence(...)` — adds evidence during the evidence window
- `close_evidence(...)` — transitions the dispute to Voting
- `resolve(...)` — performs GenLayer consensus evaluation
- `challenge(...)` — adds challenge evidence and reopens voting
- `finalize(...)` — locks the resolved dispute after the challenge window
- `get_dispute(...)`, `get_status(...)`, `get_outcome(...)`, `get_evidence_count(...)` — read methods

---

## Run the demo

```bash
npm install
npm run dev
