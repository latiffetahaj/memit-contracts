// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/UniswapV3Interfaces.sol";

library UniswapPoolCreator {
    uint256 private constant Q96 = 2 ** 96;

    // Uniswap v3 tick range limits
    int24 private constant MIN_TICK = -887272;
    int24 private constant MAX_TICK = 887272;

    struct PoolParams {
        address factory;
        address token;
        address weth;
        uint24 fee;
        uint256 ethReserve;
        uint256 tokenReserve;
    }

    struct PositionParams {
        address positionManager;
        address token;
        address weth;
        uint24 fee;
        int24 tickSpacing;
        uint256 ethAmount;
        uint256 tokenAmount;
    }

    function createAndInitializePool(
        PoolParams memory params
    ) internal returns (address pool) {
        IUniswapV3Factory factory = IUniswapV3Factory(params.factory);
        pool = factory.createPool(params.token, params.weth, params.fee);
        uint160 sqrtPriceX96 = uint160(
            Math.sqrt((params.ethReserve * Q96) / params.tokenReserve) *
                Math.sqrt(Q96)
        );
        IUniswapV3Pool(pool).initialize(sqrtPriceX96);
    }

    function createLPPosition(
        PositionParams memory params
    ) internal returns (uint256 tokenId) {
        // Round to the nearest tick spacing
        int24 minTick = (MIN_TICK / params.tickSpacing) * params.tickSpacing;
        int24 maxTick = (MAX_TICK / params.tickSpacing) * params.tickSpacing;

        // Calculate minimum amounts with 50% slippage tolerance
        uint256 amount0Min = (params.tokenAmount * 50) / 100;
        uint256 amount1Min = (params.ethAmount * 50) / 100;

        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: params.token < params.weth ? params.token : params.weth,
                token1: params.token < params.weth ? params.weth : params.token,
                fee: params.fee,
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: params.token < params.weth
                    ? params.tokenAmount
                    : params.ethAmount,
                amount1Desired: params.token < params.weth
                    ? params.ethAmount
                    : params.tokenAmount,
                amount0Min: params.token < params.weth
                    ? amount0Min
                    : amount1Min,
                amount1Min: params.token < params.weth
                    ? amount1Min
                    : amount0Min,
                recipient: address(this),
                deadline: block.timestamp
            });

        (tokenId, , , ) = INonfungiblePositionManager(params.positionManager)
            .mint{value: params.ethAmount}(mintParams);
    }
}
