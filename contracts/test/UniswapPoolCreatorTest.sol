// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/UniswapPoolCreator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IWETH {
    function deposit() external payable;

    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title UniswapPoolCreatorTest
 * @notice Test wrapper contract for UniswapPoolCreator library
 */
contract UniswapPoolCreatorTest is IERC721Receiver {
    using UniswapPoolCreator for *;

    event PoolCreated(address pool);
    event PositionCreated(uint256 tokenId);

    /**
     * @notice Test function for creating and initializing a Uniswap V3 pool
     */
    function testCreateAndInitializePool(
        UniswapPoolCreator.PoolParams calldata params
    ) external returns (address pool) {
        pool = UniswapPoolCreator.createAndInitializePool(params);
        emit PoolCreated(pool);
        return pool;
    }

    /**
     * @notice Test function for creating an LP position
     */
    function testCreateLPPosition(
        UniswapPoolCreator.PositionParams calldata params
    ) external payable returns (uint256 tokenId) {
        // Wrap ETH to WETH
        //IWETH(params.weth).deposit{value: params.ethAmount}();

        // Approve tokens to position manager
        //IWETH(params.weth).approve(params.positionManager, params.ethAmount);
        IERC20(params.token).approve(
            params.positionManager,
            params.tokenAmount
        );

        tokenId = UniswapPoolCreator.createLPPosition(params);
        emit PositionCreated(tokenId);
        return tokenId;
    }

    /**
     * @notice Implementation of IERC721Receiver
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @notice Allow the contract to receive ETH
     */
    receive() external payable {}
}
