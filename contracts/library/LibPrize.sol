// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LibPrize {
    bytes32 private constant PRIZE_TYPE =
        keccak256("PRIZE(address to,uint256 amount,uint256 uuid)");
    struct PRIZE {
        address to;
        uint256 amount;
        uint256 uuid;
    }

    function prizeHash(PRIZE memory prize) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(PRIZE_TYPE, prize.to, prize.amount, prize.uuid)
            );
    }
}
