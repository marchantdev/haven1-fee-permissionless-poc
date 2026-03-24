# Haven1 FeeContract — Permissionless setGraceContract PoC

Proof of concept for the `setGraceContract()` access control vulnerability in Haven1's `FeeContract`.

## Vulnerability

`FeeContract.setGraceContract(bool)` at `0x716ED8C844495aBf237C170E0a0a7b7a9566dBf6` has no access control.
Any contract can self-register as a "grace contract" and obtain reduced fees during the 24-hour grace period that follows each daily fee update.

## Run Tests

```bash
npm install
npx hardhat test test/PoC_PermissionlessGraceContract.test.ts
```
