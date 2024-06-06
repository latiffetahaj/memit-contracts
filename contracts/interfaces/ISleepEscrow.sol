// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface ISleepEscrow {
    error OnlyPayerCanPerformThisOperation();
    error OnlySleepFinanceCanSettleDispute();
    error ReleaseDatePending();
    error EscrowIsLocked();
    error EscowIsNotSettledYet();
    struct EscrowData {
        bool locked;
        uint256 amount;
        uint256 releaseDate;
        IERC20 token;
        address payer;
        address payee;
    }

    /**
     * Will start the escrow clock;
     * @param _config the settings for this Escrow.
     */
    function initialize(EscrowData calldata _config) external;

    /**
     * Payer can lock the Escrow. When lock expiry date is ignored until unlocked.
     * Will not change the unlock date.
     * @param status locked or unlocked
     */
    function setLock(bool status) external;

    /**
     * Payer can release the  Escrow now
     */
    function release() external;

    /**
     * Payee can claim the escrow.
     */
    function claim() external;

    /**
     * sleepfinance can settle the payment if needed.
     */
    function settle(bool toPayee) external;
}
