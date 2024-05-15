// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IToken {
    function initialize(
        string calldata name,
        string calldata symbol,
        uint256 supply
    ) external;
}
