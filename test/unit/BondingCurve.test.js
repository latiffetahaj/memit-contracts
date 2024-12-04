/* eslint-disable no-unused-expressions */
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BondingCurve Contract", function () {
    // Test variables
    let foundry;
    let factory;
    let bondingCurve;
    let token;
    let lock;
    let owner;
    let user1;
    let user2;
    let user3;

    // Constants
    const DEPLOYMENT_FEE = ethers.parseEther("0.1");
    const TOTAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens
    const VIRTUAL_ETH = ethers.parseEther("10");
    const PRE_BONDING_TARGET = ethers.parseEther("2");
    const BONDING_TARGET = ethers.parseEther("30");
    const MIN_CONTRIBUTION = ethers.parseEther("0.1");
    const POOL_FEE = 3000; // 0.3%
    const SELL_FEE = 100n; // 1%

    const defaultSettings = {
        virtualEth: VIRTUAL_ETH,
        preBondingTarget: PRE_BONDING_TARGET,
        bondingTarget: BONDING_TARGET,
        minContribution: MIN_CONTRIBUTION,
        poolFee: POOL_FEE,
        sellFee: SELL_FEE,
        uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        feeTo: ethers.ZeroAddress // Will be updated with owner address
    };

    async function deployBondingCurveFixture() {
        [owner, user1, user2, user3] = await ethers.getSigners();
        defaultSettings.feeTo = owner.address;

        // Deploy implementation contracts
        const TokenImplementation = await ethers.getContractFactory("TokenImplementation");
        const tokenImplementation = await TokenImplementation.deploy();

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        const bondingCurveImplementation = await BondingCurve.deploy();

        // Deploy Lock implementation
        const Lock = await ethers.getContractFactory("Lock");
        const lockImplementation = await Lock.deploy(defaultSettings.positionManager);

        // Deploy Factory implementation
        const Factory = await ethers.getContractFactory("Factory");
        const factoryImplementation = await Factory.deploy();

        // Deploy Foundry
        const Foundry = await ethers.getContractFactory("Foundry");
        foundry = await Foundry.deploy(
            await factoryImplementation.getAddress(),
            await lockImplementation.getAddress(),
            await tokenImplementation.getAddress(),
            await bondingCurveImplementation.getAddress(),
            DEPLOYMENT_FEE
        );

        // Deploy system through Foundry (this creates and initializes Factory and Lock clones)
        const tx = await foundry.deploySystem(owner.address, DEPLOYMENT_FEE, defaultSettings, {
            value: DEPLOYMENT_FEE
        });
        const receipt = await tx.wait();
        const event = receipt.logs.find(
            log => log.fragment?.name === "SystemDeployed"
        );
        const [factoryAddress, lockAddress] = [event.args[0], event.args[1]];

        // Get interfaces for deployed contracts
        factory = await ethers.getContractAt("Factory", factoryAddress);
        lock = await ethers.getContractAt("Lock", lockAddress);

        // Deploy bonding curve system through factory
        const deployTx = await factory.deployBondingCurveSystem(
            "Test Token",
            "TEST",
            { value: DEPLOYMENT_FEE }
        );
        const deployReceipt = await deployTx.wait();
        const deployEvent = deployReceipt.logs.find(
            log => log.fragment?.name === "BondingCurveSystemDeployed"
        );
        const [bondingCurveAddress, tokenAddress] = [deployEvent.args[0], deployEvent.args[1]];

        bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);
        token = await ethers.getContractAt("TokenImplementation", tokenAddress);

        return {
            foundry,
            factory,
            bondingCurve,
            token,
            lock,
            owner,
            user1,
            user2,
            user3
        };
    }

    beforeEach(async function () {
        ({ foundry, factory, bondingCurve, token, lock, owner, user1, user2 } = await loadFixture(
            deployBondingCurveFixture
        ));
    });
    describe("Initialization", function () {
        it("should initialize with correct state", async function () {
            expect(await bondingCurve.token()).to.equal(await token.getAddress());
            expect(await bondingCurve.lockContract()).to.equal(await lock.getAddress());
            expect(await bondingCurve.owner()).to.equal(owner.address);
            expect(await bondingCurve.currentPhase()).to.equal(0); // PreBonding
            expect(await token.balanceOf(await bondingCurve.getAddress())).to.equal(TOTAL_SUPPLY);
        });

        it("should not allow reinitialization", async function () {
            await expect(
                bondingCurve.initialize(
                    await token.getAddress(),
                    await lock.getAddress(),
                    owner.address,
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(bondingCurve, "InvalidInitialization");
        });

        it("should revert initialization with zero addresses", async function () {
            const BondingCurve = await ethers.getContractFactory("BondingCurve");
            const newBondingCurve = await BondingCurve.deploy();

            await expect(
                newBondingCurve.initialize(
                    ethers.ZeroAddress,
                    await lock.getAddress(),
                    owner.address,
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(newBondingCurve, "ZeroAddress");

            await expect(
                newBondingCurve.initialize(
                    await token.getAddress(),
                    ethers.ZeroAddress,
                    owner.address,
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(newBondingCurve, "ZeroAddress");

            await expect(
                newBondingCurve.initialize(
                    await token.getAddress(),
                    await lock.getAddress(),
                    ethers.ZeroAddress,
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(newBondingCurve, "ZeroAddress");
        });
    });

    describe("Pre-bonding Phase", function () {
        it("should accept valid contributions", async function () {
            const contribution = ethers.parseEther("1");

            // Calculate expected tokens using the same formula as the contract
            const virtualEth = defaultSettings.virtualEth;
            const totalSupply = TOTAL_SUPPLY;
            const expectedTokens = (contribution * totalSupply) / (virtualEth + contribution);

            await expect(
                bondingCurve.connect(user1).contributePreBonding({ value: contribution })
            )
                .to.emit(bondingCurve, "PreBondingContribution")
                .withArgs(
                    user1.address,
                    contribution,
                    expectedTokens
                );

            expect(await bondingCurve.contributions(user1.address)).to.equal(contribution);
            expect(await bondingCurve.totalPreBondingContributions()).to.equal(contribution);
        });

        it("should reject contributions below minimum", async function () {
            await expect(
                bondingCurve.connect(user1).contributePreBonding({
                    value: MIN_CONTRIBUTION - 1n
                })
            ).to.be.revertedWithCustomError(bondingCurve, "ContributionTooLow");
        });

        it("should lock tokens during pre-bonding", async function () {
            const contribution = ethers.parseEther("1");
            await bondingCurve.connect(user1).contributePreBonding({ value: contribution });
            expect(await bondingCurve.tokenLocks(user1.address)).to.be.true;
        });

        it("should transition to bonding phase when target reached", async function () {
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });

            expect(await bondingCurve.currentPhase()).to.equal(1); // Bonding
            expect(await bondingCurve.ethReserve()).to.equal(VIRTUAL_ETH + PRE_BONDING_TARGET);
        });

        it("should reject contributions after target reached", async function () {
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });

            await expect(
                bondingCurve.connect(user2).contributePreBonding({
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWithCustomError(bondingCurve, "InvalidPhase");
        });
    });

    describe("Bonding Phase", function () {
        beforeEach(async function () {
            // Complete pre-bonding phase
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });
        });

        it("should allow token purchases", async function () {
            const ethAmount = ethers.parseEther("1");
            const ethReserve = await bondingCurve.ethReserve();
            const tokenReserve = await bondingCurve.tokenReserve();

            // Calculate expected tokens: (ethIn * tokenReserve) / (ethReserve + ethIn)
            const expectedTokens = (ethAmount * tokenReserve) / (ethReserve + ethAmount);

            await expect(
                bondingCurve.connect(user2).buyTokens(expectedTokens, { value: ethAmount })
            )
                .to.emit(bondingCurve, "TokensPurchased")
                .withArgs(user2.address, ethAmount, expectedTokens);

            expect(await token.balanceOf(user2.address)).to.equal(expectedTokens);
        });

        it("should allow token sales", async function () {
            // First buy tokens
            const ethAmount = ethers.parseEther("1");
            await bondingCurve.connect(user2).buyTokens(0, { value: ethAmount });
            const tokenBalance = await token.balanceOf(user2.address);

            // Approve tokens for sale
            await token.connect(user2).approve(await bondingCurve.getAddress(), tokenBalance);

            // Calculate expected ETH: (tokenIn * ethReserve) / (tokenReserve + tokenIn)
            const ethReserve = await bondingCurve.ethReserve();
            const tokenReserve = await bondingCurve.tokenReserve();
            const rawEthOut = (tokenBalance * ethReserve) / (tokenReserve + tokenBalance);
            const fee = (rawEthOut * 100n) / 10000n; // 1% fee
            const expectedEth = rawEthOut - fee;

            await expect(bondingCurve.connect(user2).sellTokens(tokenBalance, expectedEth))
                .to.emit(bondingCurve, "TokensSold")
                .withArgs(user2.address, tokenBalance, expectedEth, fee);
        });

        it("should enforce slippage protection", async function () {
            const ethAmount = ethers.parseEther("1");
            const ethReserve = await bondingCurve.ethReserve();
            const tokenReserve = await bondingCurve.tokenReserve();
            const expectedTokens = (ethAmount * tokenReserve) / (ethReserve + ethAmount);
            const tooHighMinTokens = expectedTokens * 2n;

            await expect(
                bondingCurve.connect(user2).buyTokens(tooHighMinTokens, { value: ethAmount })
            ).to.be.revertedWithCustomError(bondingCurve, "SlippageExceeded");
        });


    });


    describe("Finalization", function () {

        beforeEach(async function () {
            // Complete pre-bonding
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });
            // Reach bonding target through purchases
            const remainingTarget = BONDING_TARGET - PRE_BONDING_TARGET;
            await bondingCurve.connect(user2).buyTokens(0, { value: remainingTarget });
        });

        it("should allow finalization when target reached", async function () {
            await expect(bondingCurve.finalizeCurve())
                .to.emit(bondingCurve, "CurveFinalized");
            expect(await bondingCurve.isFinalized()).to.be.true;
            expect(await bondingCurve.currentPhase()).to.equal(2); // Finalized
        });

        it("should create Uniswap pool and lock LP position", async function () {
            await bondingCurve.finalizeCurve();

            // Since we're using mock, just verify state changes
            expect(await bondingCurve.uniswapPool()).to.not.equal(ethers.ZeroAddress);
            expect(await bondingCurve.lpTokenId()).to.not.equal(0);
        });

        it("should revert multiple finalizations", async function () {
            await bondingCurve.finalizeCurve();

            await expect(bondingCurve.finalizeCurve())
                .to.be.revertedWithCustomError(bondingCurve, "AlreadyFinalized");
        });
    });

    describe("Price Calculations", function () {
        it("should maintain constant product formula", async function () {
            // Complete pre-bonding
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });

            const initialEthReserve = await bondingCurve.ethReserve();
            const initialTokenReserve = await bondingCurve.tokenReserve();
            const initialProduct = initialEthReserve * initialTokenReserve;

            // Make a purchase
            const ethAmount = ethers.parseEther("1");
            await bondingCurve.connect(user2).buyTokens(0, { value: ethAmount });

            const finalEthReserve = await bondingCurve.ethReserve();
            const finalTokenReserve = await bondingCurve.tokenReserve();
            const finalProduct = finalEthReserve * finalTokenReserve;

            // Allow for small rounding errors (0.1%)
            const tolerance = initialProduct / 1000n;
            expect(finalProduct).to.be.closeTo(initialProduct, tolerance);
        });


    });
    describe("Settings Management", function () {
        it("should enforce preBondingTarget as 20% of virtualEth", async function () {
            const newSettings = {
                ...defaultSettings,
                virtualEth: ethers.parseEther("10"),
                preBondingTarget: ethers.parseEther("5"), // This will be overridden
                bondingTarget: ethers.parseEther("50")
            };

            await factory.updateBondingCurveSettings(newSettings);
            const settings = await factory.getBondingCurveSettings();

            // Verify preBondingTarget is exactly 20% of virtualEth
            expect(settings.preBondingTarget).to.equal(
                (settings.virtualEth * 20n) / 100n
            );
        });

        it("should maintain preBondingTarget relationship after virtualEth update", async function () {
            const newSettings = {
                ...defaultSettings,
                virtualEth: ethers.parseEther("20"), // Changed to 20 ETH
                bondingTarget: ethers.parseEther("100")
            };

            await factory.updateBondingCurveSettings(newSettings);
            const settings = await factory.getBondingCurveSettings();

            // Expected preBondingTarget should be 4 ETH (20% of 20 ETH)
            const expectedPreBondingTarget = ethers.parseEther("4");
            expect(settings.preBondingTarget).to.equal(expectedPreBondingTarget);
        });

        it("should revert if bondingTarget is less than calculated preBondingTarget", async function () {
            const newSettings = {
                ...defaultSettings,
                virtualEth: ethers.parseEther("10"),
                bondingTarget: ethers.parseEther("1") // Less than 20% of virtualEth
            };

            await expect(
                factory.updateBondingCurveSettings(newSettings)
            ).to.be.revertedWithCustomError(factory, "InvalidDeploymentParameters");
        });
    });

    describe("Token Allocation Withdrawal", function () {
        beforeEach(async function () {
            // Complete pre-bonding phase
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });
            // Complete bonding phase
            const remainingTarget = BONDING_TARGET - PRE_BONDING_TARGET;
            await bondingCurve.connect(user2).buyTokens(0, {
                value: remainingTarget
            });
            // Finalize the curve
            await bondingCurve.finalizeCurve();
        });


        it("should allow withdrawal of allocated tokens to self", async function () {
            const allocation = await bondingCurve.tokenAllocations(user1.address);
            expect(allocation).to.be.gt(0);

            await expect(bondingCurve.connect(user1).withdrawTokenAllocation(user1.address))
                .to.emit(bondingCurve, "TokensUnlocked")
                .withArgs(user1.address);

            // Verify state changes
            expect(await bondingCurve.tokenAllocations(user1.address)).to.equal(0);
            expect(await bondingCurve.tokenLocks(user1.address)).to.be.false;
            expect(await token.balanceOf(user1.address)).to.equal(allocation);
        });

        it("should allow withdrawal to a different recipient", async function () {
            const allocation = await bondingCurve.tokenAllocations(user1.address);
            await expect(bondingCurve.connect(user1).withdrawTokenAllocation(user3.address))
                .to.emit(bondingCurve, "TokensUnlocked")
                .withArgs(user3.address);
            // Verify tokens were sent to recipient
            expect(await token.balanceOf(user3.address)).to.equal(allocation);
            expect(await token.balanceOf(user1.address)).to.equal(0);
        });

        it("should revert withdrawal before finalization", async function () {
            // Deploy a new system for this test
            const deployTx = await factory.deployBondingCurveSystem(
                "Test Token 2",
                "TEST2",
                { value: await factory.getDeploymentFee() }
            );
            const deployReceipt = await deployTx.wait();
            const deployEvent = deployReceipt.logs.find(
                log => log.fragment?.name === "BondingCurveSystemDeployed"
            );
            const [newBondingCurveAddress] = [deployEvent.args[0]];
            const newBondingCurve = await ethers.getContractAt("BondingCurve", newBondingCurveAddress);

            // Make a pre-bonding contribution
            await newBondingCurve.connect(user1).contributePreBonding({
                value: ethers.parseEther("1")
            });

            // Attempt withdrawal before finalization
            await expect(newBondingCurve.connect(user1).withdrawTokenAllocation(user1.address))
                .to.be.revertedWithCustomError(newBondingCurve, "CannotFinalizeYet");
        });

        it("should revert withdrawal with zero recipient address", async function () {
            await expect(bondingCurve.connect(user1).withdrawTokenAllocation(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(bondingCurve, "ZeroAddress");
        });

        it("should revert withdrawal for address without allocation", async function () {
            await expect(bondingCurve.connect(user2).withdrawTokenAllocation(user2.address))
                .to.be.revertedWithCustomError(bondingCurve, "TokensNotLocked");
        });

        it("should revert second withdrawal attempt", async function () {
            // First withdrawal
            await bondingCurve.connect(user1).withdrawTokenAllocation(user1.address);

            // Second attempt
            await expect(bondingCurve.connect(user1).withdrawTokenAllocation(user1.address))
                .to.be.revertedWithCustomError(bondingCurve, "TokensNotLocked");
        });

        it("should handle multiple users withdrawing allocations", async function () {
            // Deploy new system
            const deployTx = await factory.deployBondingCurveSystem(
                "Test Token 3",
                "TEST3",
                { value: await factory.getDeploymentFee() }
            );
            const deployReceipt = await deployTx.wait();
            const deployEvent = deployReceipt.logs.find(
                log => log.fragment?.name === "BondingCurveSystemDeployed"
            );
            const [newBondingCurveAddress] = [deployEvent.args[0]];
            const newBondingCurve = await ethers.getContractAt("BondingCurve", newBondingCurveAddress);

            // Multiple users contribute
            const contribution = PRE_BONDING_TARGET / 2n;
            await newBondingCurve.connect(user1).contributePreBonding({ value: contribution });
            await newBondingCurve.connect(user2).contributePreBonding({ value: contribution });

            // Complete bonding and finalize
            const remainingTarget = BONDING_TARGET - PRE_BONDING_TARGET;
            await newBondingCurve.buyTokens(0, { value: remainingTarget });
            await newBondingCurve.finalizeCurve();

            // Record initial allocations
            const allocation1 = await newBondingCurve.tokenAllocations(user1.address);
            const allocation2 = await newBondingCurve.tokenAllocations(user2.address);

            // Both users withdraw
            expect(await newBondingCurve.connect(user1).withdrawTokenAllocation(user1.address)).to.changeTokenBalance(token, user1, allocation1);
            expect(await newBondingCurve.connect(user2).withdrawTokenAllocation(user2.address)).to.changeTokenBalance(token, user2, allocation2);


        });
    });

    describe("Edge Cases and Security", function () {
        it("should handle multiple contributions in pre-bonding", async function () {
            const contribution = ethers.parseEther("1");
            await bondingCurve.connect(user1).contributePreBonding({ value: contribution });
            await bondingCurve.connect(user1).contributePreBonding({ value: contribution });

            expect(await bondingCurve.contributions(user1.address)).to.equal(
                contribution * 2n
            );
        });

        it("should prevent token purchases in wrong phase", async function () {
            await expect(
                bondingCurve.connect(user1).buyTokens(0, { value: ethers.parseEther("1") })
            ).to.be.revertedWithCustomError(bondingCurve, "InvalidPhase");
        });


        it("should prevent unauthorized finalization", async function () {
            await expect(
                bondingCurve.connect(user2).finalizeCurve()
            ).to.be.revertedWithCustomError(bondingCurve, "OwnableUnauthorizedAccount")
                .withArgs(user2.address);
        });

        it("should handle multiple buys and sells correctly", async function () {
            // Complete pre-bonding
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });

            // Multiple buys
            for (let i = 0; i < 3; i++) {
                await bondingCurve.connect(user2).buyTokens(0, {
                    value: ethers.parseEther("1")
                });
            }

            const tokenBalance = await token.balanceOf(user2.address);
            await token.connect(user2).approve(await bondingCurve.getAddress(), tokenBalance);

            // Calculate expected ETH for sell
            const ethReserve = await bondingCurve.ethReserve();
            const tokenReserve = await bondingCurve.tokenReserve();
            const rawEthOut = (tokenBalance * ethReserve) / (tokenReserve + tokenBalance);
            const fee = (rawEthOut * 100n) / 10000n;
            const expectedEth = rawEthOut - fee;

            await bondingCurve.connect(user2).sellTokens(tokenBalance, expectedEth);
            expect(await token.balanceOf(user2.address)).to.equal(0);
        });

        it("should handle dust amounts correctly", async function () {
            // Complete pre-bonding
            await bondingCurve.connect(user1).contributePreBonding({
                value: PRE_BONDING_TARGET
            });

            // Try to buy with minimum contribution
            await bondingCurve.connect(user2).buyTokens(0, {
                value: MIN_CONTRIBUTION
            });

            const tokenBalance = await token.balanceOf(user2.address);
            expect(tokenBalance).to.be.gt(0);
        });
    });
});