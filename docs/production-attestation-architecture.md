# Production Attestation Architecture

## Purpose

This document defines the recommended long-term architecture for Zentity's
on-chain identity attestation system.

It resolves the current split between:

- a **registrar-submitted** model, where the backend encrypts and publishes
  attestations on behalf of the user
- a **holder-controlled** model, where the user encrypts and submits the
  attestation from their own wallet

The recommended production direction is a hybrid:

- **authoritative identity facts are issuer-created**
- **delivery timing is holder-controlled**
- **access to encrypted identity data is holder-controlled**
- **runtime transactional inputs remain user-generated**

In short:

- `attestation facts`: registrar-issued
- `publication timing`: user-controlled
- `attribute grants`: user-controlled
- `transactional values`: user-encrypted

## Decision Summary

The recommended production model is:

1. Zentity verifies identity off-chain and derives the canonical claim set.
2. The user binds a wallet and signs explicit consent for on-chain disclosure.
3. The registrar encrypts the canonical on-chain attestation payload and signs
   an issuance envelope for that exact payload.
4. The user publishes that envelope on-chain from their wallet, or authorizes a
   relayer to do so.
5. The user grants scoped access to specific attributes for specific purposes.
6. Only authorized policy contracts may evaluate encrypted compliance
   predicates.
7. Revocation invalidates the active attestation revision, any outstanding
   issuance authorizations, and any stale grants tied to the old revision.

This is the best fit for a production identity product because it preserves the
integrity guarantees of issuer-backed identity while still preserving the user
control expected from holder-mediated disclosure systems.

## Why This Is The Right Long-Term Choice

### Why not pure registrar-submitted attestation?

Pure registrar-submitted attestation has strong integrity but weak user
sovereignty:

- the registrar decides when identity appears on-chain
- the user has weak cryptographic evidence of consent
- the flow does not match the holder-controlled delivery model used by
  verifiable credentials
- publication timing and chain binding are centralized

This is acceptable for a demo, but it is not the strongest product model for a
privacy-first identity system.

### Why not pure holder-generated authoritative ciphertext?

Pure holder-generated attestation ciphertext has attractive sovereignty
properties, but it is not the right production default unless the system also
has a cryptographic proof that the user-generated ciphertexts encode the exact
registrar-approved claims.

Without that extra proof, an untrusted browser can:

- obtain authorization for one claim set
- encrypt a different claim set
- publish forged authoritative state

That is not acceptable for production identity infrastructure.

### Why the hybrid is better

The hybrid model preserves the important part of holder control without making
the browser the authority for canonical identity state.

It gives the product these properties:

- `integrity`: the attested facts come from the verified issuer-controlled
  source of truth
- `consent`: the user authorizes wallet binding, target chain, selected
  attributes, and publication timing
- `privacy`: no plaintext identity data is stored on-chain
- `sovereignty`: the user decides when to publish and whom to grant access to
- `auditability`: on-chain state can be linked to proof evidence, policy
  version, and user consent
- `operability`: the same attestation model can support DeFi, compliance
  checks, agent flows, and other downstream channels

## Trust Model

The production trust model should be explicit:

- **Browser is not trusted for authoritative identity integrity.**
  The browser may request publication, grant access, decrypt authorized data,
  and produce runtime transaction inputs, but it must not define the canonical
  identity claim set by itself.
- **Registrar is trusted for attestation integrity.**
  The registrar derives the canonical attested values from the verified
  off-chain record and signs the issuance envelope.
- **User is trusted for consent and disclosure timing.**
  The user decides whether to publish, which wallet to bind, and which
  consumers may access which encrypted attributes.
- **On-chain contracts are trusted to enforce ACL, revisions, and purpose
  restrictions.**
- **Downstream protocols are not trusted with plaintext identity facts.**
  They receive encrypted results or narrowly scoped access only.

## Core Security Invariants

The production design should guarantee all of the following:

1. The canonical attested claim set must be derived from the verified off-chain
   identity record, not from browser-supplied values.
2. A registrar signature must authorize the exact encrypted payload or an exact
   commitment to that payload.
3. A user consent signature must bind the disclosure to a wallet, chain,
   contract, revision, selected attributes, purpose, and expiry.
4. No arbitrary caller may query sensitive compliance predicates and receive a
   decryptable result.
5. Revocation must invalidate all outstanding issuance authorizations tied to
   the revoked identity revision.
6. Grants must not silently carry over across revoke and re-attest cycles.
7. A compromised browser must not be able to upgrade compliance level, swap
   country, or clear blacklist status in authoritative state.

## Recommended Lifecycle

### 1. Verification and claim derivation

Zentity performs identity verification off-chain and derives a canonical
attestation claim set from the verified source of truth.

This claim set should be minimal and explicit. For the current system, that
likely includes:

- birth year offset or another age-related field
- country code
- compliance level
- blacklist status
- `proofSetHash`
- `policyVersion`

The canonical claim set is issuer-owned data, even if the user later controls
when it is disclosed on-chain.

### 2. Wallet binding

Before issuance, the user must bind the target wallet to the verified identity.

This wallet-binding step should be explicit and signed. It should prevent:

- attesting the wrong wallet
- social or UI confusion about which wallet is being published
- registrar-side unilateral rebinding

### 3. User consent receipt

The user signs a consent message covering at least:

- `user`
- `chainId`
- `registry`
- `selectedAttributeMask`
- `purposeSet` or disclosure intent
- `revision`
- `deadline`

The consent message proves that the user authorized this specific disclosure on
this specific chain and contract for this specific wallet.

### 4. Registrar issuance

The registrar constructs the authoritative encrypted attestation payload and
signs an issuance envelope for the exact payload being published.

The key production rule is:

- the registrar must sign the exact ciphertext bundle hash, or another exact
  cryptographic commitment to the payload that the contract can verify

This is what closes the integrity gap that exists when a registrar signs
plaintext but the browser publishes arbitrary ciphertexts.

### 5. Holder-controlled delivery

The preferred delivery model is:

- the user submits the attestation transaction from their wallet

If tooling constraints make this impractical on a given network or integration,
the fallback is:

- a relayer submits on behalf of the user, but only with the user's signed
  consent receipt attached

The product requirement is not "the user must always broadcast directly." The
real requirement is:

- the user must control disclosure timing and publication authorization

### 6. Scoped grants

The user grants access after publication using explicit per-attribute,
per-purpose grants.

Production grants must be:

- narrow
- auditable
- revision-scoped
- revocable

The user should never have to grant broad permanent access to all attributes
unless that is an intentional and visible choice.

### 7. Policy evaluation

Only authorized policy contracts may request encrypted compliance checks from
the registry.

The registry should not expose decryptable predicate helpers to arbitrary
callers. Instead:

- authorized policy contracts perform the checks
- results are returned only to the authorized caller and, where appropriate,
  the user
- contracts may evaluate only the attributes the user granted for that purpose

### 8. Revocation and re-attestation

Revocation must be a full lifecycle boundary.

When an identity is revoked:

- the active attestation revision is invalidated
- outstanding issuance authorizations for that revision are invalidated
- grants tied to that revision become unusable
- downstream systems can detect the revocation and cascade state updates

Re-attestation should create a new revision, not silently reuse the old access
surface.

## Recommended Contract Model

### IdentityRegistry responsibilities

The production `IdentityRegistry` should be responsible for:

- storing authoritative encrypted identity attributes
- storing attestation metadata
- enforcing revision-based lifecycle rules
- enforcing scoped grants
- restricting predicate evaluation to authorized consumers
- exposing auditable public metadata such as `proofSetHash` and
  `policyVersion`

### Attestation revisions

Every attestation should have a monotonic revision or version for each user.

That revision should change when:

- a user is first attested
- an attestation is revoked
- a new attestation is published after revocation

This revision must scope:

- grants
- issuance authorizations
- cached verification results

The current model of grants keyed only by `(user, grantee)` is too weak for a
production lifecycle because it allows stale access state to survive across
identity resets.

### Issuance envelope

The on-chain attestation entrypoint should verify an issuance envelope that
contains at least:

- `user`
- `revision`
- `attributeMask`
- `proofSetHash`
- `policyVersion`
- `consentHash`
- `bundleHash`
- `issuedAt`
- `deadline`

Where:

- `consentHash` commits to the user's signed disclosure authorization
- `bundleHash` commits to the exact encrypted payload being written on-chain

The registrar signature must cover the full issuance envelope.

The contract should reject publication if:

- the registrar signature is invalid
- the user consent is invalid or expired
- the revision is stale
- the bundle does not match the registrar-approved `bundleHash`
- the identity is already attested for the active revision

### Suggested entrypoint shape

One possible production shape is:

```solidity
function publishAttestation(
    AttestationEnvelope calldata envelope,
    UserConsent calldata consent,
    externalEuint8 encBirthYearOffset,
    externalEuint16 encCountryCode,
    externalEuint8 encComplianceLevel,
    externalEbool encIsBlacklisted,
    bytes calldata inputProof
) external;
```

The exact function shape can vary, but the security requirements should not.

The contract must verify:

- the user consent
- the registrar authorization
- the exact encrypted bundle commitment
- the active revision

### Grant model

Grants should be keyed by:

- `user`
- `grantee`
- `revision`
- `purpose`

At minimum, grants must not outlive the attestation revision they were granted
against.

### Predicate access control

Registry helper functions such as compliance and blacklist predicates should
not be callable by arbitrary EOAs.

Use one of these patterns:

- allow only explicitly authorized policy contracts
- or require both authorization and an applicable user grant

The result handle should never be granted to arbitrary `msg.sender` by default.

### Cached verification results

If verification results are cached on-chain, cache keys must include the
attestation revision. Otherwise stale results can outlive revocation and
re-attestation boundaries.

## What Should Remain User-Generated

The hybrid model does not eliminate user-generated ciphertext. It narrows it to
the places where it is actually the right trust model.

User-generated ciphertext should remain the default for:

- transfer amounts
- approvals and allowances
- runtime protocol inputs chosen by the user
- user-initiated decrypt or re-encrypt requests
- any future holder-presented private disclosures that are not authoritative
  issuer facts

These are values the user is supposed to control at runtime. They are not part
of the canonical identity record.

## What Should Not Be User-Generated

The browser should not be the authoritative source for canonical attestation
facts such as:

- compliance level
- blacklist status
- country code
- age-related eligibility fields
- proof evidence linkage metadata

Those values are derived from verified identity state and must therefore be
issuer-controlled.

## Product-Level Architecture Fit

This model best matches Zentity's broader product design:

- Web2 verification remains the source of truth for identity integrity.
- The on-chain channel becomes another disclosure surface, not an independent
  identity authority.
- The user still gets the same core rights expected from privacy-preserving
  disclosure systems:
  - choose the wallet
  - authorize publication
  - control grants
  - revoke later

This keeps the on-chain model aligned with the rest of Zentity's identity
bridge philosophy without turning the browser into a trusted identity issuer.

## Operational Recommendations

For production, issuance authority should not rely on a single hot private key.

Preferred options:

- threshold registrar
- HSM-backed registrar signing
- multisig-governed registrar policy changes

The minimum acceptable production posture is:

- protected signing infrastructure
- auditable issuance logs
- explicit registrar rotation
- revocation fan-out into off-chain records and credentials

## Future Optional Upgrade

If Zentity later wants a fully holder-generated authoritative attestation
payload, that should be treated as a separate advanced design, not the default
production path.

That model requires an additional proof system showing that:

- the user-generated ciphertexts encrypt the exact registrar-approved claims

Until such a proof exists and is implemented end to end, holder-generated
authoritative ciphertext should be considered a research direction, not the
production baseline.

## Recommended Next Steps

1. Treat this hybrid model as the target production architecture.
2. Update the registry design to use revision-scoped grants and restricted
   predicate evaluation.
3. Replace plaintext-only registrar permits with issuance envelopes that bind
   the exact encrypted payload.
4. Add explicit user consent receipts covering wallet, chain, contract,
   selected attributes, revision, and expiry.
5. Move production issuance toward threshold or HSM-backed registrar
   infrastructure.

## Bottom Line

The best long-term production decision is:

- **issuer-created attestation**
- **holder-controlled delivery**
- **holder-controlled grants**
- **user-generated runtime ciphertext only**

That is the strongest architecture for a real identity product because it keeps
identity integrity anchored in verified issuer-controlled state while preserving
the user's control over disclosure timing and downstream access.
