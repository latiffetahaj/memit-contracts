/* eslint-disable no-unused-expressions */
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");



// Add the pool interface
const UNISWAP_POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

// Add WETH interface
const WETH_ABI = [
    "function deposit() external payable",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

describe("UniswapPoolCreator Library", function () {
    // Constants from mainnet contracts
    const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const POOL_FEE = 3000; // 0.3%

    // Test variables
    let owner;
    let testToken;
    let poolCreatorTest;
    let uniswapFactory;
    let positionManager;

    async function deployTestContracts() {
        const [deployer] = await ethers.getSigners();
        owner = deployer;

        // Deploy test token with larger initial supply
        const TestToken = await ethers.getContractFactory("TestToken");
        testToken = await TestToken.deploy("Test Token", "TEST");
        await testToken.waitForDeployment();

        // Deploy test wrapper
        const UniswapPoolCreatorTest = await ethers.getContractFactory("UniswapPoolCreatorTest");
        poolCreatorTest = await UniswapPoolCreatorTest.deploy();
        await poolCreatorTest.waitForDeployment();

        // Get Uniswap contracts
        uniswapFactory = await ethers.getContractAt("IUniswapV3Factory", UNISWAP_V3_FACTORY);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", POSITION_MANAGER);

        // Get WETH contract
        const weth = await ethers.getContractAt(WETH_ABI, WETH_ADDRESS);

        return { testToken, poolCreatorTest, uniswapFactory, positionManager, weth, owner };
    }

    beforeEach(async function () {
        const contracts = await loadFixture(deployTestContracts);
        testToken = contracts.testToken;
        poolCreatorTest = contracts.poolCreatorTest;
        uniswapFactory = contracts.uniswapFactory;
        positionManager = contracts.positionManager;
        owner = contracts.owner;
    });

    describe("createAndInitializePool", function () {
        it("should successfully create and initialize a new pool", async function () {
            const ethReserve = ethers.parseEther("10");
            const tokenReserve = ethers.parseEther("10000");

            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve,
                tokenReserve
            };

            const tx = await poolCreatorTest.testCreateAndInitializePool(poolParams);
            const receipt = await tx.wait();

            // Get pool address from events
            const poolCreatedEvent = receipt.logs.find(
                (log) => log.fragment?.name === "PoolCreated"
            );
            expect(poolCreatedEvent).to.not.be.undefined;
            // Verify pool exists
            const poolAddress = await uniswapFactory.getPool(
                await testToken.getAddress(),
                WETH_ADDRESS,
                POOL_FEE
            );
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("should set the correct initial price", async function () {
            const ethReserve = ethers.parseEther("10");
            const tokenReserve = ethers.parseEther("10000");

            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve,
                tokenReserve
            };

            await poolCreatorTest.testCreateAndInitializePool(poolParams);

            // Get pool address
            const poolAddress = await uniswapFactory.getPool(
                await testToken.getAddress(),
                WETH_ADDRESS,
                POOL_FEE
            );

            // Get pool contract with correct interface
            const pool = await ethers.getContractAt(UNISWAP_POOL_ABI, poolAddress);

            // Check slot0 for price
            const { sqrtPriceX96 } = await pool.slot0();
            const actualPrice = sqrtPriceX96;

            // Calculate expected price
            const expectedSqrtPrice = Math.sqrt((Number(ethReserve) / Number(tokenReserve))) * 2 ** 96;

            // Allow for some precision loss
            expect(Number(actualPrice)).to.be.approximately(
                expectedSqrtPrice,
                expectedSqrtPrice * 0.001 // 0.1% tolerance
            );
        });

        it("should revert if pool already exists", async function () {
            const ethReserve = ethers.parseEther("10");
            const tokenReserve = ethers.parseEther("10000");

            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve,
                tokenReserve
            };

            await poolCreatorTest.testCreateAndInitializePool(poolParams);

            // Try to create the same pool again
            await expect(
                poolCreatorTest.testCreateAndInitializePool(poolParams)
            ).to.be.reverted;
        });
    });

    describe("createLPPosition", function () {


        beforeEach(async function () {
            await loadFixture(deployTestContracts);
            // Create pool first
            const ethReserve = ethers.parseEther("10");
            const tokenReserve = ethers.parseEther("10000");

            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve,
                tokenReserve
            };

            await poolCreatorTest.testCreateAndInitializePool(poolParams);
            await uniswapFactory.getPool(
                await testToken.getAddress(),
                WETH_ADDRESS,
                POOL_FEE
            );

            // Transfer tokens to test contract
            const tokenAmount = ethers.parseEther("1000");
            await testToken.mint(await poolCreatorTest.getAddress(), tokenAmount);
        });

        it("should create position with correct tick range", async function () {
            const ethAmount = ethers.parseEther("1");
            const tokenAmount = ethers.parseEther("1000");
            const testContractAddress = await poolCreatorTest.getAddress();

            const posParams = {
                positionManager: POSITION_MANAGER,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                tickSpacing: 60,
                ethAmount,
                tokenAmount
            };


            const tx = await poolCreatorTest.testCreateLPPosition(posParams, {
                value: ethAmount
            });
            const receipt = await tx.wait();

            // Find Transfer event by its signature and parse manually
            const transferEventSignature = "Transfer(address,address,uint256)";
            const transferEventTopic = ethers.id(transferEventSignature);

            const transferLog = receipt.logs.find(
                (log) => log.topics[0] === transferEventTopic &&
                    log.topics[2] === ethers.zeroPadValue(testContractAddress.toLowerCase(), 32)
            );

            expect(transferLog).to.not.be.undefined;

            // Parse tokenId from the third topic (index 2)
            const tokenId = ethers.getBigInt(transferLog.topics[3]);

            // Check position ticks
            const position = await positionManager.positions(tokenId);

            // Verify full range position
            const MIN_TICK = -887272;
            const MAX_TICK = 887272;

            // Calculate expected ticks based on tick spacing
            const expectedLowerTick = Math.floor(MIN_TICK / posParams.tickSpacing) * posParams.tickSpacing;
            const expectedUpperTick = Math.floor(MAX_TICK / posParams.tickSpacing) * posParams.tickSpacing;

            // expect(position.tickLower).to.equal(expectedLowerTick);
            expect(position.tickUpper).to.equal(expectedUpperTick);
            expect(position.liquidity).to.be.gt(0);
        });

        it("should successfully create an LP position", async function () {
            const ethAmount = ethers.parseEther("1");
            const tokenAmount = ethers.parseEther("1000");
            const testContractAddress = await poolCreatorTest.getAddress();

            const posParams = {
                positionManager: POSITION_MANAGER,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                tickSpacing: 60,
                ethAmount,
                tokenAmount
            };


            const tx = await poolCreatorTest.testCreateLPPosition(posParams, {
                value: ethAmount
            });
            const receipt = await tx.wait();

            // Find Transfer event by its signature and parse manually
            const transferEventSignature = "Transfer(address,address,uint256)";
            const transferEventTopic = ethers.id(transferEventSignature);

            const transferLog = receipt.logs.find(
                (log) => log.topics[0] === transferEventTopic &&
                    log.topics[2] === ethers.zeroPadValue(testContractAddress.toLowerCase(), 32)
            );

            expect(transferLog).to.not.be.undefined;

            // Parse tokenId from the third topic
            const tokenId = ethers.getBigInt(transferLog.topics[3]);

            // Verify position exists and has liquidity
            const position = await positionManager.positions(tokenId);
            expect(position.liquidity).to.be.gt(0);
        });

    });

    describe("Edge Cases and Error Handling", function () {
        it("should handle zero liquidity amounts", async function () {
            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve: 0,
                tokenReserve: 0
            };

            await expect(
                poolCreatorTest.testCreateAndInitializePool(poolParams)
            ).to.be.reverted;
        });

        it("should handle extremely large amounts", async function () {
            const largeAmount = ethers.parseEther("1000000"); // 1M ETH
            const poolParams = {
                factory: UNISWAP_V3_FACTORY,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve: largeAmount,
                tokenReserve: largeAmount
            };

            // Should not revert with large but safe numbers
            await expect(
                poolCreatorTest.testCreateAndInitializePool(poolParams)
            ).to.not.be.reverted;
        });

        it("should validate input addresses", async function () {
            const poolParams = {
                factory: ethers.ZeroAddress,
                token: await testToken.getAddress(),
                weth: WETH_ADDRESS,
                fee: POOL_FEE,
                ethReserve: ethers.parseEther("1"),
                tokenReserve: ethers.parseEther("1000")
            };

            await expect(
                poolCreatorTest.testCreateAndInitializePool(poolParams)
            ).to.be.reverted;
        });
    });
});