// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IToken {
    function initialize(
        string calldata name,
        string calldata symbol,
        uint256 supply
    ) external;
}
