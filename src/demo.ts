import { DisputeResolver } from "./disputeResolver"

function sleepAdvance(now: number, ms: number) {
	return now + ms
}

const validators = ["V1", "V2", "V3", "V4", "V5"]

const resolver = new DisputeResolver(validators, {
	type: "supermajority",
	minYesFraction: 2 / 3, // 66%
})

let now = Date.now()

// 1) Open a dispute
const d1 = resolver.openDispute({
	partyA: "Alice",
	partyB: "Bob",
	claimUri: "order#123: Alice says delivered, Bob says not delivered",
	nowMs: now,
	evidenceWindowMs: 2_000,
	votingWindowMs: 2_000,
	challengeWindowMs: 2_000,
})
console.log("Opened:", d1)

// 2) Submit evidence (during evidence window)
resolver.submitEvidence({
	disputeId: d1.id,
	submitter: "Alice",
	uri: "https://example.com/proof-of-delivery.png",
	notes: "Photo proof",
	nowMs: now + 500,
})
resolver.submitEvidence({
	disputeId: d1.id,
	submitter: "Bob",
	uri: "https://example.com/chat-log.txt",
	notes: "Chat shows not delivered",
	nowMs: now + 900,
})

console.log("With evidence:", resolver.getDispute(d1.id))

// 3) Wait evidence window end, start voting
now = sleepAdvance(now, 2_100)
resolver.closeEvidenceAndStartVoting({ disputeId: d1.id, nowMs: now })
console.log("Voting started:", resolver.getDispute(d1.id))

// 4) Validators vote (need supermajority of votes cast)
resolver.castVote({ disputeId: d1.id, validator: "V1", outcome: "SPLIT", nowMs: now + 100 })
resolver.castVote({ disputeId: d1.id, validator: "V2", outcome: "SPLIT", nowMs: now + 200 })
resolver.castVote({ disputeId: d1.id, validator: "V3", outcome: "SPLIT", nowMs: now + 300 })
resolver.castVote({ disputeId: d1.id, validator: "V4", outcome: "B_WINS", nowMs: now + 400 })
console.log("Votes:", resolver.getDispute(d1.id))

// 5) Wait voting window end, resolve
now = sleepAdvance(now, 2_100)
const resolved = resolver.resolve({ disputeId: d1.id, nowMs: now })
console.log("Resolved:", resolved)

// 6) Wait challenge window end, finalize
now = sleepAdvance(now, 2_100)
const finalized = resolver.finalize({ disputeId: d1.id, nowMs: now })
console.log("Finalized:", finalized)