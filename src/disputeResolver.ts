export type Address = string

export type DisputeStatus =
	| "Open" // created, waiting for evidence
	| "EvidenceClosed" // evidence window ended
	| "Voting" // validators can vote
	| "Resolved" // outcome decided, challenge window open
	| "Finalized" // locked

export type Outcome = "A_WINS" | "B_WINS" | "SPLIT" | "UNDECIDED"

export type Evidence = {
	id: number
	submitter: Address
	uri: string // link/hash pointer to evidence
	notes?: string
	createdAtMs: number
}

export type Vote = {
	validator: Address
	outcome: Exclude<Outcome, "UNDECIDED">
	rationaleUri?: string // optional: link to explanation
	createdAtMs: number
}

export type Dispute = {
	id: number
	partyA: Address
	partyB: Address
	claimUri: string // description of dispute, order id, etc.
	status: DisputeStatus

	createdAtMs: number
	evidenceDeadlineMs: number
	voteDeadlineMs: number
	challengeDeadlineMs: number

	evidence: Evidence[]
	votes: Vote[]

	outcome: Outcome
	resolvedAtMs?: number
	finalizedAtMs?: number
}

/**
 * A local, educational primitive (TypeScript) that demonstrates:
 * - clear state machine
 * - evidence window
 * - validator voting + threshold consensus
 * - challenge window before finalization
 *
 * In a real GenLayer contract, "nowMs" would come from block time and
 * "validators" from the network/consensus context.
 */
export class DisputeResolver {
	private disputes = new Map<number, Dispute>()
	private nextDisputeId = 1

	constructor(
		private readonly validators: Address[],
		private readonly threshold: { type: "supermajority"; minYesFraction: number } = {
			type: "supermajority",
			minYesFraction: 2 / 3,
		},
	) {
		if (validators.length < 3) {
			throw new Error("Need at least 3 validators for meaningful consensus")
		}
		if (threshold.minYesFraction <= 0.5) {
			throw new Error("Use >50% threshold to avoid weak consensus")
		}
	}

	openDispute(args: {
		partyA: Address
		partyB: Address
		claimUri: string
		nowMs: number
		evidenceWindowMs?: number
		votingWindowMs?: number
		challengeWindowMs?: number
	}): Dispute {
		const {
			partyA,
			partyB,
			claimUri,
			nowMs,
			evidenceWindowMs = 60_000,
			votingWindowMs = 60_000,
			challengeWindowMs = 60_000,
		} = args

		if (!partyA || !partyB) throw new Error("partyA and partyB required")
		if (partyA === partyB) throw new Error("partyA and partyB must be different")
		if (!claimUri) throw new Error("claimUri required")

		const id = this.nextDisputeId++
		const d: Dispute = {
			id,
			partyA,
			partyB,
			claimUri,
			status: "Open",
			createdAtMs: nowMs,
			evidenceDeadlineMs: nowMs + evidenceWindowMs,
			voteDeadlineMs: nowMs + evidenceWindowMs + votingWindowMs,
			challengeDeadlineMs: nowMs + evidenceWindowMs + votingWindowMs + challengeWindowMs,
			evidence: [],
			votes: [],
			outcome: "UNDECIDED",
		}
		this.disputes.set(id, d)
		return this.clone(d)
	}

	submitEvidence(args: {
		disputeId: number
		submitter: Address
		uri: string
		notes?: string
		nowMs: number
	}): Dispute {
		const d = this.mustGet(args.disputeId)
		this.assertStatus(d, ["Open"])
		if (args.nowMs > d.evidenceDeadlineMs) throw new Error("Evidence window closed")
		if (!args.uri) throw new Error("Evidence uri required")

		const e: Evidence = {
			id: d.evidence.length + 1,
			submitter: args.submitter,
			uri: args.uri,
			notes: args.notes,
			createdAtMs: args.nowMs,
		}
		d.evidence.push(e)
		return this.clone(d)
	}

	closeEvidenceAndStartVoting(args: { disputeId: number; nowMs: number }): Dispute {
		const d = this.mustGet(args.disputeId)
		this.assertStatus(d, ["Open"])
		if (args.nowMs < d.evidenceDeadlineMs) throw new Error("Evidence window not ended yet")
		d.status = "Voting"
		return this.clone(d)
	}

	castVote(args: {
		disputeId: number
		validator: Address
		outcome: Exclude<Outcome, "UNDECIDED">
		rationaleUri?: string
		nowMs: number
	}): Dispute {
		const d = this.mustGet(args.disputeId)
		this.assertStatus(d, ["Voting"])
		if (args.nowMs > d.voteDeadlineMs) throw new Error("Voting window closed")
		if (!this.validators.includes(args.validator)) throw new Error("Not an allowed validator")

		const existing = d.votes.find((v) => v.validator === args.validator)
		if (existing) throw new Error("Validator already voted")

		d.votes.push({
			validator: args.validator,
			outcome: args.outcome,
			rationaleUri: args.rationaleUri,
			createdAtMs: args.nowMs,
		})
		return this.clone(d)
	}

	resolve(args: { disputeId: number; nowMs: number }): Dispute {
		const d = this.mustGet(args.disputeId)
		this.assertStatus(d, ["Voting"])
		if (args.nowMs < d.voteDeadlineMs) throw new Error("Voting window not ended yet")

		const counts = this.countVotes(d)
		const totalVotes = d.votes.length
		if (totalVotes === 0) throw new Error("No votes cast")

		// Determine if any outcome meets supermajority of votes cast.
		const minNeeded = Math.ceil(totalVotes * this.threshold.minYesFraction)
		let winner: Outcome = "UNDECIDED"
		for (const o of ["A_WINS", "B_WINS", "SPLIT"] as const) {
			if (counts[o] >= minNeeded) winner = o
		}
		if (winner === "UNDECIDED") {
			throw new Error("No supermajority consensus reached")
		}

		d.outcome = winner
		d.status = "Resolved"
		d.resolvedAtMs = args.nowMs
		return this.clone(d)
	}

	finalize(args: { disputeId: number; nowMs: number }): Dispute {
		const d = this.mustGet(args.disputeId)
		this.assertStatus(d, ["Resolved"])
		if (args.nowMs < d.challengeDeadlineMs) {
			throw new Error("Challenge window not ended yet")
		}
		d.status = "Finalized"
		d.finalizedAtMs = args.nowMs
		return this.clone(d)
	}

	getDispute(disputeId: number): Dispute | null {
		const d = this.disputes.get(disputeId)
		return d ? this.clone(d) : null
	}

	// ---- helpers ----
	private mustGet(id: number): Dispute {
		const d = this.disputes.get(id)
		if (!d) throw new Error("Dispute not found")
		return d
	}

	private assertStatus(d: Dispute, allowed: DisputeStatus[]) {
		if (!allowed.includes(d.status)) {
			throw new Error(`Invalid status: ${d.status}. Allowed: ${allowed.join(", ")}`)
		}
	}

	private countVotes(d: Dispute): Record<Exclude<Outcome, "UNDECIDED">, number> {
		const counts = { A_WINS: 0, B_WINS: 0, SPLIT: 0 }
		for (const v of d.votes) counts[v.outcome]++
		return counts
	}

	private clone<T>(x: T): T {
		return JSON.parse(JSON.stringify(x)) as T
	}
}