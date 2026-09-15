# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json


@allow_storage
@dataclass
class Evidence:
    submitter: Address
    uri: str
    notes: str
    created_at: u64


@allow_storage
@dataclass
class Dispute:
    party_a: Address
    party_b: Address
    claim_uri: str
    status: str
    created_at: u64
    evidence_deadline: u64
    vote_deadline: u64
    challenge_deadline: u64
    outcome: str
    evidence_count: u32
    resolution_reason: str
    challenge_count: u32


class DisputeResolver(gl.Contract):
    disputes: TreeMap[u256, Dispute]
    evidence_store: TreeMap[u256, Evidence]
    next_dispute_id: u256

    def __init__(self):
        self.next_dispute_id = u256(1)

    def _now(self) -> u64:
        return u64(int(datetime.now(timezone.utc).timestamp()))

    @gl.public.write
    def open_dispute(
        self,
        party_b: str,
        claim_uri: str,
        evidence_window_seconds: int = 300,
        voting_window_seconds: int = 300,
        challenge_window_seconds: int = 300,
    ) -> u256:
        party_a = gl.message.sender_address
        other = Address(party_b)

        if party_a == other:
            raise gl.UserError("party_a and party_b must be different")
        if not claim_uri:
            raise gl.UserError("claim_uri is required")
        if evidence_window_seconds <= 0:
            raise gl.UserError("evidence window must be positive")
        if voting_window_seconds <= 0:
            raise gl.UserError("voting window must be positive")
        if challenge_window_seconds <= 0:
            raise gl.UserError("challenge window must be positive")

        now = self._now()
        dispute_id = self.next_dispute_id

        self.disputes[dispute_id] = Dispute(
            party_a=party_a,
            party_b=other,
            claim_uri=claim_uri,
            status="Open",
            created_at=now,
            evidence_deadline=u64(now + evidence_window_seconds),
            vote_deadline=u64(now + evidence_window_seconds + voting_window_seconds),
            challenge_deadline=u64(
                now
                + evidence_window_seconds
                + voting_window_seconds
                + challenge_window_seconds
            ),
            outcome="UNDECIDED",
            evidence_count=u32(0),
            resolution_reason="",
            challenge_count=u32(0),
        )

        self.next_dispute_id = u256(dispute_id + 1)
        return dispute_id

    @gl.public.write
    def submit_evidence(self, dispute_id: int, uri: str, notes: str = "") -> None:
        if not uri:
            raise gl.UserError("evidence URI is required")

        dispute = self.disputes[u256(dispute_id)]
        now = self._now()

        if dispute.status != "Open":
            raise gl.UserError("evidence can only be submitted while Open")
        if now > dispute.evidence_deadline:
            raise gl.UserError("evidence window has closed")

        evidence_id = u256(dispute_id * 1000000 + dispute.evidence_count)

self.evidence_store[evidence_id] = Evidence(
    submitter=gl.message.sender_address,
    uri=uri,
    notes=notes,
    created_at=now,
)

dispute.evidence_count = u32(dispute.evidence_count + 1)

    @gl.public.write
    def close_evidence(self, dispute_id: int) -> None:
        dispute = self.disputes[u256(dispute_id)]
        if dispute.status != "Open":
            raise gl.UserError("dispute is not Open")
        if self._now() < dispute.evidence_deadline:
            raise gl.UserError("evidence window has not ended")
        dispute.status = "Voting"

    def _evidence_text(self, dispute_id: int, dispute: Dispute) -> str:
        parts = [
            f"Claim: {dispute.claim_uri}",
            f"Party A: {dispute.party_a.as_hex}",
            f"Party B: {dispute.party_b.as_hex}",
        ]
        for index in range(dispute.evidence_count):
    evidence_id = u256(dispute_id * 1000000 + index)
    item = self.evidence_store[evidence_id]
    parts.append(
        f"Evidence {index + 1}: URI={item.uri}; notes={item.notes}"
    )
        return "\n".join(parts)

    @gl.public.write
    def resolve(self, dispute_id: int) -> str:
        dispute = self.disputes[u256(dispute_id)]
        now = self._now()

        if dispute.status != "Voting":
            raise gl.UserError("dispute must be in Voting state")
        if now < dispute.vote_deadline:
            raise gl.UserError("voting window has not ended")
        if dispute.evidence_count == 0:
            raise gl.UserError("at least one evidence item is required")

        evidence_text = self._evidence_text(dispute_id, dispute)
        claim_uri = dispute.claim_uri

        def leader_fn():
            prompt = f"""
Resolve this contractual dispute using only the supplied claim and evidence.

Claim:
{claim_uri}

Evidence:
{evidence_text}

Return JSON with exactly:
{{
  "outcome": "A_WINS" | "B_WINS" | "SPLIT",
  "confidence": 0-100,
  "reason": "short evidence-grounded explanation"
}}

A_WINS means the evidence supports Party A.
B_WINS means the evidence supports Party B.
SPLIT means the evidence supports both parties or is materially balanced.
Do not invent facts that are not present in the supplied material.
"""
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False

            candidate = leader_result.calldata
            if not isinstance(candidate, dict):
                return False

            outcome = candidate.get("outcome")
            confidence = candidate.get("confidence")

            if outcome not in ("A_WINS", "B_WINS", "SPLIT"):
                return False
            if not isinstance(confidence, (int, float)):
                return False
            if confidence < 0 or confidence > 100:
                return False

            prompt = f"""
Independently evaluate this dispute.

Claim:
{claim_uri}

Evidence:
{evidence_text}

Leader proposal:
{json.dumps(candidate)}

Return JSON:
{{"accept": true|false, "outcome": "A_WINS"|"B_WINS"|"SPLIT"}}

Accept only if the proposed outcome is supported by the evidence,
does not invent material facts, and is the most reasonable outcome.
Your outcome must be your independent judgment.
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                return False

            return (
                result.get("accept") is True
                and result.get("outcome") == outcome
            )

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        if not isinstance(result, gl.vm.Return):
            raise gl.UserError("consensus did not return a valid result")

        decision = result.calldata
        if not isinstance(decision, dict):
            raise gl.UserError("invalid consensus result")

        outcome = decision.get("outcome")
        if outcome not in ("A_WINS", "B_WINS", "SPLIT"):
            raise gl.UserError("consensus produced an invalid outcome")

        dispute.outcome = outcome
        dispute.resolution_reason = str(decision.get("reason", ""))
        dispute.status = "Resolved"
        return outcome

    @gl.public.write
    def challenge(self, dispute_id: int, challenge_uri: str) -> None:
        if not challenge_uri:
            raise gl.UserError("challenge URI is required")

        dispute = self.disputes[u256(dispute_id)]
        now = self._now()

        if dispute.status != "Resolved":
            raise gl.UserError("only a Resolved dispute can be challenged")
        if now >= dispute.challenge_deadline:
            raise gl.UserError("challenge window has ended")

        evidence_id = u256(dispute_id * 1000000 + dispute.evidence_count)

self.evidence_store[evidence_id] = Evidence(
    submitter=gl.message.sender_address,
    uri=challenge_uri,
    notes="Challenge evidence",
    created_at=now,
)

dispute.evidence_count = u32(dispute.evidence_count + 1)
        dispute.challenge_count = u32(dispute.challenge_count + 1)
        dispute.status = "Voting"
        dispute.vote_deadline = u64(now + 300)
        dispute.challenge_deadline = u64(now + 600)

    @gl.public.write
    def finalize(self, dispute_id: int) -> None:
        dispute = self.disputes[u256(dispute_id)]
        if dispute.status != "Resolved":
            raise gl.UserError("only a Resolved dispute can be finalized")
        if self._now() < dispute.challenge_deadline:
            raise gl.UserError("challenge window has not ended")
        dispute.status = "Finalized"

    @gl.public.view
    def get_dispute(self, dispute_id: int) -> Dispute:
        return self.disputes[u256(dispute_id)]

    @gl.public.view
    def get_status(self, dispute_id: int) -> str:
        return self.disputes[u256(dispute_id)].status

    @gl.public.view
    def get_outcome(self, dispute_id: int) -> str:
        return self.disputes[u256(dispute_id)].outcome

    @gl.public.view
    def get_evidence_count(self, dispute_id: int) -> int:
        return len(self.disputes[u256(dispute_id)].evidence)
