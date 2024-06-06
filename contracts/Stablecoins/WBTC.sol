// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
    uint8 _decimals = 18;

    constructor() ERC20("Wrapped BTC", "WBTC") {
        _mint(
            0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6,
            500000000000 * 10 ** _decimals
        );
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
