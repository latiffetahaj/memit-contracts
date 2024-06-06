// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/INonfungiblePositionManager.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/ISleepEscrow.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

contract EscrowFactory is Ownable {
    using Address for address payable;
    using SafeERC20 for IERC20;
    address public escrowImplementation;
    uint256 public fees;
    error LowFees();
    event CLONE(address indexed payer, address indexed payee, address escrow);
    struct Deploy {
        string name;
        string symbol;
        uint256 supply;
        IWETH9 weth;
        INonfungiblePositionManager uniswap;
    }

    constructor(
        address initialOwner,
        address _escrowImplementation
    ) Ownable(initialOwner) {
        fees = 0.005 ether;
        escrowImplementation = _escrowImplementation;
    }

    function updateFees(uint256 fee) external onlyOwner {
        fees = fee;
    }

    function create(
        ISleepEscrow.EscrowData calldata deploy
    ) external payable returns (address escrow) {
        escrow = Clones.clone(escrowImplementation);
        ISleepEscrow(escrow).initialize(deploy);
        if (address(deploy.token) == address(0)) {
            payable(escrow).sendValue(deploy.amount);
        } else {
            deploy.token.safeTransferFrom(_msgSender(), escrow, deploy.amount);
        }
        if (address(this).balance < fees) revert LowFees();
        payable(owner()).sendValue(address(this).balance);
        emit CLONE(_msgSender(), deploy.payee, escrow);
    }

    /**
     * project dev remove any ERC20Tokens Sent here after Launch
     */
    function removeTokens(IERC20Minimal token) external {
        uint256 tbal = token.balanceOf(address(this));
        if (tbal > 0) token.transfer(owner(), tbal);
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) payable(owner()).sendValue(ethBal);
    }
}
