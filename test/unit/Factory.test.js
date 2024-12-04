/* eslint-disable no-unused-expressions */
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Factory Contract", function () {
    let foundry;
    let factory;
    let tokenImplementation;
    let bondingCurveImplementation;
    let lockContract;
    let owner;
    let user1;
    let user2;

    // Constants
    const DEPLOYMENT_FEE = ethers.parseEther("0.1");

    // Default bonding curve settings
    const defaultSettings = {
        virtualEth: ethers.parseEther("5"),
        preBondingTarget: ethers.parseEther("1"),
        bondingTarget: ethers.parseEther("30"),
        minContribution: ethers.parseEther("0.1"),
        poolFee: 3000, // 0.3%
        sellFee: 10000, // 0.3%
        uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        feeTo: ethers.ZeroAddress // Will be updated with owner address
    };

    async function deployFactoryFixture() {
        [owner, user1, user2] = await ethers.getSigners();

        // Update feeTo in settings
        defaultSettings.feeTo = owner.address;

        // Deploy implementation contracts
        const TokenImplementation = await ethers.getContractFactory("TokenImplementation");
        tokenImplementation = await TokenImplementation.deploy();

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        bondingCurveImplementation = await BondingCurve.deploy();

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
        lockContract = await ethers.getContractAt("Lock", lockAddress);

        return {
            foundry,
            factory,
            tokenImplementation,
            bondingCurveImplementation,
            lockContract,
            owner,
            user1,
            user2
        };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployFactoryFixture);
        foundry = fixture.foundry;
        factory = fixture.factory;
        tokenImplementation = fixture.tokenImplementation;
        bondingCurveImplementation = fixture.bondingCurveImplementation;
        lockContract = fixture.lockContract;
        owner = fixture.owner;
        user1 = fixture.user1;
        user2 = fixture.user2;
    });

    describe("Deployment", function () {
        it("should be deployed with correct initial state", async function () {
            expect(await factory.owner()).to.equal(owner.address);
            expect(await factory.getTokenImplementation()).to.equal(
                await tokenImplementation.getAddress()
            );
            expect(await factory.getBondingCurveImplementation()).to.equal(
                await bondingCurveImplementation.getAddress()
            );
            expect(await factory.getLockContract()).to.equal(
                await lockContract.getAddress()
            );

            const settings = await factory.getBondingCurveSettings();
            expect(settings.virtualEth).to.equal(defaultSettings.virtualEth);
            expect(settings.preBondingTarget).to.equal(defaultSettings.preBondingTarget);
            expect(settings.bondingTarget).to.equal(defaultSettings.bondingTarget);
            expect(settings.minContribution).to.equal(defaultSettings.minContribution);
            expect(settings.poolFee).to.equal(defaultSettings.poolFee);
        });

        it("should be properly initialized through Foundry", async function () {
            // Verify factory was deployed through Foundry
            expect(await foundry.isDeployedClone(await factory.getAddress())).to.be.true;

            // Try to initialize again (should fail)
            await expect(
                factory.initialize(
                    DEPLOYMENT_FEE,
                    owner.address,
                    await tokenImplementation.getAddress(),
                    await bondingCurveImplementation.getAddress(),
                    await lockContract.getAddress(),
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
        });
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await factory.owner()).to.equal(owner.address);
            expect(await factory.getTokenImplementation()).to.equal(
                await tokenImplementation.getAddress()
            );
            expect(await factory.getBondingCurveImplementation()).to.equal(
                await bondingCurveImplementation.getAddress()
            );
            expect(await factory.getLockContract()).to.equal(
                await lockContract.getAddress()
            );

            const settings = await factory.getBondingCurveSettings();
            expect(settings.virtualEth).to.equal(defaultSettings.virtualEth);
            expect(settings.preBondingTarget).to.equal(defaultSettings.preBondingTarget);
            expect(settings.bondingTarget).to.equal(defaultSettings.bondingTarget);
            expect(settings.minContribution).to.equal(defaultSettings.minContribution);
            expect(settings.poolFee).to.equal(defaultSettings.poolFee);
        });

        it("should not allow reinitialization", async function () {
            await expect(
                factory.initialize(
                    DEPLOYMENT_FEE,
                    owner.address,
                    await tokenImplementation.getAddress(),
                    await bondingCurveImplementation.getAddress(),
                    await lockContract.getAddress(),
                    defaultSettings
                )
            ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
        });
    });

    describe("Bonding Curve System Deployment", function () {
        const tokenName = "Test Token";
        const tokenSymbol = "TEST";

        it("should deploy token and bonding curve successfully", async function () {
            const tx = await factory.deployBondingCurveSystem(
                tokenName,
                tokenSymbol,
                { value: DEPLOYMENT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => log.fragment?.name === "BondingCurveSystemDeployed"
            );

            expect(event).to.not.be.undefined;
            const [bondingCurveAddress, tokenAddress] = [event.args[0], event.args[1]];

            // Verify token initialization
            const token = await ethers.getContractAt("TokenImplementation", tokenAddress);
            expect(await token.name()).to.equal(tokenName);
            expect(await token.symbol()).to.equal(tokenSymbol);
            expect(await token.isMinted()).to.be.true;

            // Verify bonding curve initialization
            const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);
            expect(await bondingCurve.token()).to.equal(tokenAddress);
            expect(await bondingCurve.lockContract()).to.equal(await lockContract.getAddress());
        });

        it("should store correct token-bondingCurve relationships", async function () {
            const tx = await factory.deployBondingCurveSystem(
                tokenName,
                tokenSymbol,
                { value: DEPLOYMENT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => log.fragment?.name === "BondingCurveSystemDeployed"
            );

            const [bondingCurveAddress, tokenAddress] = [event.args[0], event.args[1]];

            expect(await factory.getBondingCurveForToken(tokenAddress))
                .to.equal(bondingCurveAddress);
            expect(await factory.getTokenForBondingCurve(bondingCurveAddress))
                .to.equal(tokenAddress);
        });

        it("should revert deployment with insufficient fee", async function () {
            const insufficientFee = DEPLOYMENT_FEE - 1n;
            await expect(
                factory.deployBondingCurveSystem(tokenName, tokenSymbol, {
                    value: insufficientFee
                })
            ).to.be.revertedWithCustomError(factory, "InsufficientDeploymentFee");
        });

        it("should revert deployment with invalid parameters", async function () {
            await expect(
                factory.deployBondingCurveSystem("", "", { value: DEPLOYMENT_FEE })
            ).to.be.revertedWithCustomError(factory, "InvalidDeploymentParameters");
        });
    });

    describe("Settings Management", function () {
        it("should allow owner to update bonding curve settings", async function () {
            const newSettings = {
                ...defaultSettings,
                virtualEth: ethers.parseEther("10"),
                preBondingTarget: ethers.parseEther("2"), // forces 20%
                bondingTarget: ethers.parseEther("50")
            };

            await expect(factory.updateBondingCurveSettings(newSettings))
                .to.emit(factory, "BondingCurveSettingsUpdated")
                .withArgs(
                    newSettings.virtualEth,
                    newSettings.preBondingTarget,
                    newSettings.bondingTarget,
                    newSettings.minContribution,
                    newSettings.poolFee
                );

            const settings = await factory.getBondingCurveSettings();
            expect(settings.virtualEth).to.equal(newSettings.virtualEth);
            expect(settings.preBondingTarget).to.equal(newSettings.preBondingTarget);
            expect(settings.bondingTarget).to.equal(newSettings.bondingTarget);
        });

        it("should revert settings update from non-owner", async function () {
            await expect(
                factory.connect(user1).updateBondingCurveSettings(defaultSettings)
            ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("Fee Management", function () {
        it("should allow owner to update deployment fee", async function () {
            const newFee = ethers.parseEther("0.2");

            await expect(factory.updateDeploymentFee(newFee))
                .to.emit(factory, "DeploymentFeeUpdated")
                .withArgs(DEPLOYMENT_FEE, newFee);

            expect(await factory.getDeploymentFee()).to.equal(newFee);
        });

        it("should allow owner to withdraw fees", async function () {
            // Deploy a system to accumulate fees
            await factory.deployBondingCurveSystem("Test", "TEST", {
                value: DEPLOYMENT_FEE
            });

            const initialBalance = await ethers.provider.getBalance(user2.address);

            await expect(factory.withdrawFees(user2.address))
                .to.emit(factory, "FeesWithdrawn")
                .withArgs(user2.address, DEPLOYMENT_FEE);

            const finalBalance = await ethers.provider.getBalance(user2.address);
            expect(finalBalance).to.equal(initialBalance + DEPLOYMENT_FEE);
        });

        it("should revert fee withdrawal with zero address", async function () {
            await expect(
                factory.withdrawFees(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(factory, "ZeroAddress");
        });

        it("should revert fee withdrawal when no fees available", async function () {
            await expect(
                factory.withdrawFees(user2.address)
            ).to.be.revertedWithCustomError(factory, "NoFeesToWithdraw");
        });

        it("should revert fee updates from non-owner", async function () {
            await expect(
                factory.connect(user1).updateDeploymentFee(ethers.parseEther("0.2"))
            ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("Multiple Deployments", function () {
        it("should handle multiple system deployments", async function () {
            const deployments = [];

            // Deploy three systems
            for (let i = 0; i < 3; i++) {
                const tx = await factory.deployBondingCurveSystem(
                    `Test Token ${i}`,
                    `TEST${i}`,
                    { value: DEPLOYMENT_FEE }
                );
                const receipt = await tx.wait();
                const event = receipt.logs.find(
                    log => log.fragment?.name === "BondingCurveSystemDeployed"
                );
                deployments.push({
                    bondingCurve: event.args[0],
                    token: event.args[1]
                });
            }

            // Verify all deployments are tracked correctly
            for (const deployment of deployments) {
                expect(await factory.getBondingCurveForToken(deployment.token))
                    .to.equal(deployment.bondingCurve);
                expect(await factory.getTokenForBondingCurve(deployment.bondingCurve))
                    .to.equal(deployment.token);
            }
        });
    });
});