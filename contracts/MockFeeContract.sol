// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title MockFeeContract
 * @notice Minimal reproduction of Haven1's FeeContract vulnerability.
 *
 * The real contract is deployed at 0x716ED8C844495aBf237C170E0a0a7b7a9566dBf6 on mainnet.
 * This mock replicates only the vulnerable surface: setGraceContract() and getFee().
 *
 * VULNERABILITY: setGraceContract(bool) has NO access control.
 * Any address can self-register as a grace contract and obtain reduced fees
 * during the 24-hour grace period that follows each daily fee update.
 */
contract MockFeeContract {
    mapping(address => bool) private _graceContracts;
    mapping(address => bool) private _feeExemptEOAs;

    uint256 private _fee;
    uint256 private _feePrior;
    uint256 private _lastFeeUpdate;
    uint256 private constant GRACE_PERIOD = 3600; // 1 hour for test; production uses ~daily

    event GraceContractSet(address indexed contractAddress, bool status);

    constructor() {
        _feePrior = 1 ether; // prior fee (lower)
        _fee = 2 ether;      // current fee (higher after update)
        _lastFeeUpdate = block.timestamp;
    }

    // -----------------------------------------------------------------------
    // VULNERABLE FUNCTION — no access control, any caller can self-register
    // -----------------------------------------------------------------------
    function setGraceContract(bool status_) external {
        _graceContracts[msg.sender] = status_;
        emit GraceContractSet(msg.sender, status_);
    }

    // -----------------------------------------------------------------------
    // Intended: only H1NativeApplication contracts should be registered.
    // The authorized path is __H1NativeApplication_init_unchained() which
    // calls setGraceContract(true) during system-controlled initialization.
    // An unauthorized caller bypasses this gating entirely.
    // -----------------------------------------------------------------------

    function _isGracePeriod() internal view returns (bool) {
        return block.timestamp <= _lastFeeUpdate + GRACE_PERIOD;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function getFee() public view returns (uint256) {
        if (_feeExemptEOAs[tx.origin]) return 0;
        if (_graceContracts[msg.sender] && _isGracePeriod()) {
            return _min(_feePrior, _fee); // grace contracts pay the LOWER of old/new fee
        }
        return _fee;
    }

    function isGraceContract(address addr) external view returns (bool) {
        return _graceContracts[addr];
    }

    function triggerFeeUpdate(uint256 newFee_) external {
        _feePrior = _fee;
        _fee = newFee_;
        _lastFeeUpdate = block.timestamp;
    }
}
