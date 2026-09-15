import { describe, expect, test } from "vitest"
import { DisputeResolver } from "../src/disputeResolver"

const validators = ["V1", "V2", "V3", "V4", "V5"]

describe("DisputeResolver", () => {
	test("full flow: open -> evidence -> voting -> resolved -> finalized", () => {
		const r = new DisputeResolver(validators, {
			type: "supermajority",
			minYesFraction: 2 / 3,
		})

		let now = 1_000_000
		const d = r.openDispute({
			partyA: "A",
			partyB: "B",
			claimUri: "order#1 dispute",
			nowMs: now,
			evidenceWindowMs: 100,
			votingWindowMs: 100,
			challengeWindowMs: 100,
		})

		r.submitEvidence({ disputeId: d.id, submitter: "A", uri: "ev1", nowMs: now + 10 })
		now += 150
		r.closeEvidenceAndStartVoting({ disputeId: d.id, nowMs: now })

		r.castVote({ disputeId: d.id, validator: "V1", outcome: "A_WINS", nowMs: now + 1 })
		r.castVote({ disputeId: d.id, validator: "V2", outcome: "A_WINS", nowMs: now + 2 })
		r.castVote({ disputeId: d.id, validator: "V3", outcome: "A_WINS", nowMs: now + 3 })

		now += 150
		const resolved = r.resolve({ disputeId: d.id, nowMs: now })
		expect(resolved.status).toBe("Resolved")
		expect(resolved.outcome).toBe("A_WINS")

		now += 150
		const finalized = r.finalize({ disputeId: d.id, nowMs: now })
		expect(finalized.status).toBe("Finalized")
	})

	test("rejects double voting by same validator", () => {
		const r = new DisputeResolver(validators)
		let now = 1_000_000
		const d = r.openDispute({ partyA: "A", partyB: "B", claimUri: "x", nowMs: now, evidenceWindowMs: 0 })
		r.closeEvidenceAndStartVoting({ disputeId: d.id, nowMs: now })

		r.castVote({ disputeId: d.id, validator: "V1", outcome: "SPLIT", nowMs: now })
		expect(() =>
			r.castVote({ disputeId: d.id, validator: "V1", outcome: "SPLIT", nowMs: now + 1 }),
		).toThrow(/already voted/i)
	})

	test("fails resolve if no supermajority", () => {
		const r = new DisputeResolver(validators, { type: "supermajority", minYesFraction: 2 / 3 })
		let now = 1_000_000
		const d = r.openDispute({
			partyA: "A",
			partyB: "B",
			claimUri: "x",
			nowMs: now,
			evidenceWindowMs: 0,
			votingWindowMs: 10,
		})
		r.closeEvidenceAndStartVoting({ disputeId: d.id, nowMs: now })

		// 3 votes cast: 2 for A, 1 for B => 2/3 is exactly 66.6..; but with ceil(minNeeded) => ceil(3*2/3)=2
		// Here it WOULD pass. So we use 4 votes to force 3 needed.
		r.castVote({ disputeId: d.id, validator: "V1", outcome: "A_WINS", nowMs: now })
		r.castVote({ disputeId: d.id, validator: "V2", outcome: "A_WINS", nowMs: now })
		r.castVote({ disputeId: d.id, validator: "V3", outcome: "B_WINS", nowMs: now })
		r.castVote({ disputeId: d.id, validator: "V4", outcome: "B_WINS", nowMs: now })

		now += 20
		expect(() => r.resolve({ disputeId: d.id, nowMs: now })).toThrow(/No supermajority/i)
	})
})