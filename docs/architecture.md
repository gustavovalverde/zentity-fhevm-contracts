# Architecture

## Components

- **IdentityRegistry**
  - Stores encrypted user attributes (birth year offset, country code, KYC level, blacklist status).
  - Controlled by registrars (typically the backend).

- **ComplianceRules**
  - Runs encrypted checks against the registry and caches encrypted results.
  - Authorizes callers (e.g., the token) that can request compliance checks.

- **CompliantERC20**
  - Demo token that enforces compliance on transfers using encrypted checks.
  - Uses branch-free logic to avoid leaking sensitive conditions.

## High-level flow

1) Registrar attests user data into `IdentityRegistry` (encrypted inputs).
2) User grants access to `ComplianceRules`.
3) `ComplianceRules` computes encrypted compliance results.
4) `CompliantERC20` calls `ComplianceRules` to decide transfer eligibility.

## Architecture diagram (overview)

```mermaid
flowchart TB
  subgraph Web2[Web2]
    UI[User UI]
    Backend[Registrar Backend]
  end

  subgraph Web3[Web3 / EVM]
    direction TB
    IR[IdentityRegistry]
    Token[CompliantERC20]
    CR[ComplianceRules]
    ACL[(FHEVM ACL)]
  end

  subgraph FHEVM[FHEVM Services]
    Coprocessor[(Coprocessor)]
    KMS[(KMS Verifier)]
  end

  UI -->|user data| Backend
  Backend -->|encrypt and attestIdentity| IR
  UI -->|grantAccessTo| IR
  IR -->|allow access| CR

  Token -->|checkCompliance| CR
  CR -->|queries| IR

  IR --> ACL
  CR --> ACL
  Token --> ACL

  IR -.-> Coprocessor
  CR -.-> Coprocessor
  Token -.-> Coprocessor
  KMS -.-> IR
```

## Data flow diagram (attestation + compliant transfer)

```mermaid
sequenceDiagram
  participant User
  participant Backend
  participant IR as IdentityRegistry
  participant CR as ComplianceRules
  participant Token as CompliantERC20

  User->>Backend: Provide identity attributes
  Backend->>Backend: Encrypt (externalEuint*, inputProof)
  Backend->>IR: attestIdentity(handles, proof)

  User->>IR: grantAccessTo(CR)

  User->>Token: transfer(to, encryptedAmount)
  Token->>CR: checkCompliance(user)
  CR->>IR: hasMinKycLevel / isNotBlacklisted
  CR-->>Token: encrypted compliance result
  Token->>Token: FHE.select(transfer or no-op)
```

## Notes

- Encrypted arithmetic is unchecked (wraps), so guard patterns may be required.
- Authorization checks must be enforced at the point of use.
- Async decrypt flows must be one-time use to avoid replay.
