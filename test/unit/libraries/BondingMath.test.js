const { expect } = require("chai");
const { ethers, } = require("hardhat");

describe("BondingMath Library", function () {
    let BondingMathTest;
    let bondingMath;

    // Constants for testing
    const PRECISION = ethers.parseEther("1"); // 1e18
    const SELL_FEE = 100n; // 1% (based on 10000)

    // Test values
    const ETH_RESERVE = ethers.parseEther("10"); // 10 ETH
    const TOKEN_RESERVE = ethers.parseEther("100"); // 1000 tokens

    before(async function () {
        // Deploy test wrapper contract for BondingMath library
        BondingMathTest = await ethers.getContractFactory("BondingMathTest");
        bondingMath = await BondingMathTest.deploy();
        await bondingMath.waitForDeployment();
    });

    describe("calculateTokensForETH", function () {

        it("should correctly calculate tokens for a given ETH input", async function () {
            const ethIn = ethers.parseEther("1"); // 1 ETH
            const tokens = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                ethIn
            );

            // Calculate expected tokens: (ethIn * tokenReserve) / (ethReserve + ethIn)
            const expectedTokens = (ethIn * TOKEN_RESERVE) / (ETH_RESERVE + ethIn);

            // Allow for small rounding differences
            const diff = tokens - expectedTokens;
            expect(Math.abs(Number(diff))).to.be.lessThan(1e9); // Allow 1 gwei difference
        });

        it("should handle small ETH inputs", async function () {
            const ethIn = ethers.parseEther("0.0001"); // 0.0001 ETH
            const tokens = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                ethIn,
            );

            expect(tokens).to.be.greaterThan(0);
        });

        it("should handle large ETH inputs", async function () {
            const ethIn = ethers.parseEther("1000"); // 1000 ETH
            const tokens = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                ethIn,
            );

            expect(tokens).to.be.lessThan(TOKEN_RESERVE);
        });

        it("should return 0 for 0 ETH input", async function () {
            const tokens = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                0,
            );

            expect(tokens).to.equal(0);
        });
    });

    describe("calculateETHForTokens", function () {
        it("should correctly calculate ETH output with fees", async function () {
            const tokenIn = ethers.parseEther("10"); // 10 tokens
            const result = await bondingMath.calculateETHForTokens(
                ETH_RESERVE,
                TOKEN_RESERVE,
                tokenIn,
                SELL_FEE
            );
            const [ethOut, fee] = [result[0], result[1]];

            // Calculate raw ETH output: (tokenIn * ethReserve) / (tokenReserve + tokenIn)
            const rawEthOut = (tokenIn * ETH_RESERVE) / (TOKEN_RESERVE + tokenIn);

            // Fee should be 1% of rawEthOut
            const expectedFee = (rawEthOut * SELL_FEE) / 10000n;
            const expectedEthOut = rawEthOut - expectedFee;

            // Allow for small rounding differences
            const ethOutDiff = ethOut - expectedEthOut;
            const feeDiff = fee - expectedFee;
            expect(Math.abs(Number(ethOutDiff))).to.be.lessThan(1e9);
            expect(Math.abs(Number(feeDiff))).to.be.lessThan(1e9);
        });

        it("should calculate ETH output without fees", async function () {
            const tokenIn = ethers.parseEther("100");
            const result = await bondingMath.calculateETHForTokens(
                ETH_RESERVE,
                TOKEN_RESERVE,
                tokenIn,
                0,
            );
            const [ethOut, fee] = [result[0], result[1]];

            expect(fee).to.equal(0);
            const expectedEthOut =
                (tokenIn * ETH_RESERVE) / (TOKEN_RESERVE + tokenIn);
            expect(ethOut).to.equal(expectedEthOut);
        });

        it("should handle small token inputs", async function () {
            const tokenIn = ethers.parseEther("0.0001");
            const result = await bondingMath.calculateETHForTokens(
                ETH_RESERVE,
                TOKEN_RESERVE,
                tokenIn,
                SELL_FEE,
            );
            const [ethOut, fee] = [result[0], result[1]];

            expect(ethOut).to.be.greaterThan(0);
            expect(fee).to.be.greaterThan(0);
        });

        it("should handle large token inputs", async function () {
            const tokenIn = ethers.parseEther("10000");
            const result = await bondingMath.calculateETHForTokens(
                ETH_RESERVE,
                TOKEN_RESERVE,
                tokenIn,
                SELL_FEE,
            );
            const [ethOut, fee] = [result[0], result[1]];

            expect(ethOut + fee).to.be.lessThan(ETH_RESERVE);
        });

        it("should return 0 for 0 token input", async function () {
            const result = await bondingMath.calculateETHForTokens(
                ETH_RESERVE,
                TOKEN_RESERVE,
                0,
                SELL_FEE,
            );
            const [ethOut, fee] = [result[0], result[1]];

            expect(ethOut).to.equal(0);
            expect(fee).to.equal(0);
        });
    });

    describe("getCurrentPrice", function () {
        it("should calculate correct price with standard reserves", async function () {
            const price = await bondingMath.getCurrentPrice(ETH_RESERVE, TOKEN_RESERVE);
            const expectedPrice = (ETH_RESERVE * PRECISION) / TOKEN_RESERVE;

            // Allow for small rounding differences
            const diff = price - expectedPrice;
            expect(Math.abs(Number(diff))).to.be.lessThan(1e9);
        });

        it("should handle extreme reserve ratios", async function () {
            const smallReserve = ethers.parseEther("0.0001");
            const largeReserve = ethers.parseEther("1000");

            const highPrice = await bondingMath.getCurrentPrice(largeReserve, smallReserve);
            const lowPrice = await bondingMath.getCurrentPrice(smallReserve, largeReserve);

            expect(highPrice).to.be.greaterThan(lowPrice);
        });

        it("should maintain price invariant after trades", async function () {
            // Simulate a buy
            const ethIn = ethers.parseEther("1");
            const tokensOut = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                ethIn,
            );

            const newEthReserve = ETH_RESERVE + ethIn;
            const newTokenReserve = TOKEN_RESERVE - tokensOut;

            const priceAfterBuy = await bondingMath.getCurrentPrice(
                newEthReserve,
                newTokenReserve,
            );
            const initialPrice = await bondingMath.getCurrentPrice(
                ETH_RESERVE,
                TOKEN_RESERVE,
            );

            // Price should increase after buy
            expect(priceAfterBuy).to.be.greaterThan(initialPrice);
        });
    });

    describe("Edge Cases and Invariants", function () {
        it("should maintain constant product invariant", async function () {
            const ethIn = ethers.parseEther("1");
            const tokensOut = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                ethIn
            );

            const initialProduct = ETH_RESERVE * TOKEN_RESERVE;
            const finalProduct = (ETH_RESERVE + ethIn) * (TOKEN_RESERVE - tokensOut);

            // Allow for rounding errors up to 0.1%
            const tolerance = (initialProduct * 1n) / 1000n; // 0.1% of initial product
            const diff = finalProduct > initialProduct ?
                finalProduct - initialProduct :
                initialProduct - finalProduct;

            expect(diff).to.be.lessThan(tolerance);
        });

        it("should prevent excessive token drain", async function () {
            const largeEthIn = ETH_RESERVE * 10n; // Using smaller multiple to prevent overflow
            const tokensOut = await bondingMath.calculateTokensForETH(
                ETH_RESERVE,
                TOKEN_RESERVE,
                largeEthIn
            );

            // Should never drain more than ~99.9% of tokens
            const maxDrain = (TOKEN_RESERVE * 999n) / 1000n;
            expect(tokensOut).to.be.lessThan(maxDrain);
        });

        it("should handle large but safe values", async function () {
            const largeButSafeValue = ethers.parseEther("1000000"); // 1M ETH

            // Should not revert with large but safe numbers
            await expect(
                bondingMath.calculateTokensForETH(
                    largeButSafeValue,
                    largeButSafeValue,
                    ethers.parseEther("1000")
                )
            ).to.not.be.reverted;

            await expect(
                bondingMath.calculateETHForTokens(
                    largeButSafeValue,
                    largeButSafeValue,
                    ethers.parseEther("1000"),
                    SELL_FEE
                )
            ).to.not.be.reverted;
        });

        it("should handle maximum planned values", async function () {

            // Should not revert with large numbers
            await expect(
                bondingMath.calculateTokensForETH(
                    ethers.parseEther("40"),
                    ethers.parseEther("1000000000"),
                    ethers.parseEther("5"),
                ),
            ).to.not.be.reverted;

            await expect(
                bondingMath.calculateETHForTokens(
                    ethers.parseEther("40"),
                    ethers.parseEther("1000000000"),
                    ethers.parseEther("400000"),
                    SELL_FEE,
                ),
            ).to.not.be.reverted;
        });
    });
});
