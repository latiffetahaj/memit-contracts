// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "./interfaces/ISleepEscrow.sol";

contract SleepEscrow is Initializable, ContextUpgradeable, ISleepEscrow {
    using SafeERC20 for IERC20;
    using Address for address payable;
    uint256 public feePercent;
    address public sleepfinance;
    bool public paid;
    EscrowData config;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    modifier onlyPayer() {
        if (config.payer != _msgSender())
            revert OnlyPayerCanPerformThisOperation();
        _;
    }

    function escrow() external view returns (EscrowData memory) {
        return config;
    }

    /**
     * Will start the escrow clock;
     * @param _config the settings for this Escrow.
     */
    function initialize(EscrowData calldata _config) public initializer {
        config = _config;
        sleepfinance = 0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6;
        feePercent = 500; // 5%
    }

    /**
     * Payer can lock the Escrow. When lock expiry date is ignored until unlocked.
     * Will not change the unlock date.
     * @param status locked or unlocked
     */
    function setLock(bool status) external onlyPayer {
        config.locked = status;
    }

    /**
     * Payer can release the  Escrow now
     */
    function release() external onlyPayer {
        config.locked = false;
        config.releaseDate = block.timestamp;
    }

    /**
     * Payee can claim the escrow.
     */
    function claim() external {
        if (config.locked) revert EscrowIsLocked();
        if (config.releaseDate > block.timestamp) revert ReleaseDatePending();
        uint256 fee = Math.mulDiv(feePercent, config.amount, 10000);
        __pay(config.amount - fee, fee, config.payee);
    }

    /**
     * sleepfinance can settle the payment if needed.
     */
    function settle(bool toPayee) external {
        if (_msgSender() != sleepfinance)
            revert OnlySleepFinanceCanSettleDispute();
        uint256 fee = Math.mulDiv(feePercent, config.amount, 10000);
        address destination = toPayee ? config.payee : config.payer;
        __pay(config.amount - fee, fee, destination);
    }

    function __pay(uint256 amount, uint256 fee, address destination) internal {
        if (address(config.token) == address(0)) {
            payable(destination).sendValue(amount);
            payable(sleepfinance).sendValue(fee);
        } else {
            config.token.safeTransfer(destination, amount);
            config.token.safeTransfer(sleepfinance, fee);
        }
        paid = true;
    }

    /**
     * payee can recover any funds sent here by mistake after paid
     * @param token tokens to recover
     */
    function recover(address token) external {
        if (!paid) revert EscowIsNotSettledYet();
        if (address(token) == address(0)) {
            payable(config.payee).sendValue(address(this).balance);
        } else {
            IERC20(token).safeTransfer(
                config.payee,
                IERC20(token).balanceOf(address(this))
            );
        }
    }

    receive() external payable {}
}
