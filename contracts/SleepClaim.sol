// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {LibPrize} from "./library/LibPrize.sol";
import "hardhat/console.sol";

contract SleepClaim is Ownable, EIP712 {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    EnumerableSet.Bytes32Set used;
    address public signitory;
    uint256 public totalClaimed;
    IERC20 public sleep;

    event Withdraw(
        address indexed user,
        bytes32 indexed digest,
        address to,
        uint256 amount,
        uint256 uuid
    );

    error PrizeBalanceIsLow();
    error UsedSignature();
    error InvalidSignature();

    constructor(
        address initialOwner,
        address _signitory,
        IERC20 _sleep
    ) Ownable(initialOwner) EIP712("PrizeClaim", "1") {
        signitory = _signitory;
        sleep = _sleep;
        console.log(block.chainid);
    }

    function isUsed(bytes32 digest) external view returns (bool) {
        return used.contains(digest);
    }

    function changeSigner(address _signitory) public onlyOwner {
        signitory = _signitory;
    }

    /**
     * @notice allows user to withdraw his prize using signed hash;
     * @param req Multisend Struct
     * @param signature Senders Signature;
     */
    function withdrawPrize(
        LibPrize.PRIZE calldata req,
        bytes calldata signature
    ) external {
        bytes32 digest = verify(req, signature);
        emit Withdraw(_msgSender(), digest, req.to, req.amount, req.uuid);
        totalClaimed += req.amount;
        sleep.safeTransfer(req.to, req.amount);
    }

    function verify(
        LibPrize.PRIZE calldata req,
        bytes calldata signature
    ) internal returns (bytes32 digest) {
        if (sleep.balanceOf(address(this)) < req.amount)
            revert PrizeBalanceIsLow();
        digest = _hashTypedDataV4(LibPrize.prizeHash(req));
        if (used.contains(digest)) revert UsedSignature();
        address signedBy = digest.recover(signature);
        console.log(signitory, signedBy);
        console.logBytes32(digest);
        if (signitory != signedBy) revert InvalidSignature();

        used.add(digest);
        return digest;
    }

    /**
     * owner can recover any tokens sent here by mistake.
     * Contract cannot accept BNB so no need
     * @param token tokens to recover
     */
    function recover(address token) external onlyOwner {
        IERC20(token).safeTransfer(
            owner(),
            IERC20(token).balanceOf(address(this))
        );
    }
}
