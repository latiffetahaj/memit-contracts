// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/BondingMath.sol";

contract BondingMathTest {
    function calculateTokensForETH(
        uint256 ethReserve,
        uint256 tokenReserve,
        uint256 ethIn
    ) external pure returns (uint256) {
        return
            BondingMath.calculateTokensForETH(ethReserve, tokenReserve, ethIn);
    }

    function calculateETHForTokens(
        uint256 ethReserve,
        uint256 tokenReserve,
        uint256 tokenIn,
        uint24 sellFee
    ) external pure returns (uint256 ethOut, uint256 fee) {
        return
            BondingMath.calculateETHForTokens(
                ethReserve,
                tokenReserve,
                tokenIn,
                sellFee
            );
    }

    function getCurrentPrice(
        uint256 ethReserve,
        uint256 tokenReserve
    ) external pure returns (uint256) {
        return BondingMath.getCurrentPrice(ethReserve, tokenReserve);
    }
}
