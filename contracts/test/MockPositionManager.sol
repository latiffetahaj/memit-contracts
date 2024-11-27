// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPositionManager
 * @notice Mock implementation of Uniswap V3's NonfungiblePositionManager for testing
 */
contract MockPositionManager is ERC721, Ownable {
    struct Position {
        // Position specific data
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        // Fee tracking
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    // Token ID to Position mapping
    mapping(uint256 => Position) public positions;

    // Accumulated fees per token
    mapping(uint256 => uint256) public fees0;
    mapping(uint256 => uint256) public fees1;

    constructor()
        ERC721("Mock Uniswap V3 Positions NFT", "UNI-V3-POS")
        Ownable(msg.sender)
    {}

    function mint(address recipient, uint256 tokenId) external {
        _mint(recipient, tokenId);

        // Initialize position with some default values
        positions[tokenId] = Position({
            tickLower: -887272, // Represents minimum tick
            tickUpper: 887272, // Represents maximum tick
            liquidity: 1000, // Default liquidity
            feeGrowthInside0LastX128: 0,
            feeGrowthInside1LastX128: 0,
            tokensOwed0: 0,
            tokensOwed1: 0
        });
    }

    /**
     * @notice Mock setting accumulated fees for testing
     * @param tokenId The ID of the position
     * @param amount0 Amount of token0 fees
     * @param amount1 Amount of token1 fees
     */
    function setFees(
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1
    ) external {
        Position storage position = positions[tokenId];
        position.tokensOwed0 = uint128(amount0);
        position.tokensOwed1 = uint128(amount1);
    }

    /**
     * @notice Mock collect function to simulate fee collection
     * @param params The collection parameters
     * @return amount0 Amount of token0 collected
     * @return amount1 Amount of token1 collected
     */
    // Updated collect function to match Uniswap V3's return type
    function collect(
        CollectParams calldata params
    )
        external
        returns (
            uint256,
            uint256 // Changed to explicitly return a tuple
        )
    {
        require(_isApprovedOrOwner(msg.sender, params.tokenId), "Not approved");

        Position storage position = positions[params.tokenId];
        uint256 amount0 = uint256(position.tokensOwed0);
        uint256 amount1 = uint256(position.tokensOwed1);

        position.tokensOwed0 = 0;
        position.tokensOwed1 = 0;

        return (amount0, amount1); // Return as tuple
    }

    // Struct to match Uniswap V3's interface
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    /**
     * @notice Check if an address is the owner or approved for an NFT
     * @param spender The address to check
     * @param tokenId The NFT ID
     * @return bool Whether the address is approved or owner
     */
    function _isApprovedOrOwner(
        address spender,
        uint256 tokenId
    ) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner ||
            isApprovedForAll(owner, spender) ||
            getApproved(tokenId) == spender);
    }
}
