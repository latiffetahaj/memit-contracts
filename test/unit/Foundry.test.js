/* eslint-disable no-unused-expressions */
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Foundry Contract", function () {
    let foundry;
    let factoryImplementation;
    let lockImplementation;
    let tokenImplementation;
    let bondingCurveImplementation;
    let owner;
    let user1;
    let user2;

    // Initial deployment fee
    const INITIAL_FEE = ethers.parseEther("0.1");

    // Default bonding curve settings
    const defaultBondingCurveSettings = {
        virtualEth: ethers.parseEther("5"),
        preBondingTarget: ethers.parseEther("5"),
        bondingTarget: ethers.parseEther("30"),
        minContribution: ethers.parseEther("0.1"),
        poolFee: 3000, // 0.3%
        sellFee: 100n, // 1%
        uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Mainnet address
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", // Mainnet address
        weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Mainnet address
        feeTo: ethers.ZeroAddress // Will be set to owner
    };

    async function deployFoundryFixture() {
        [owner, user1, user2] = await ethers.getSigners();

        // Update feeTo in settings
        defaultBondingCurveSettings.feeTo = owner.address;

        // Deploy implementation contracts
        const Factory = await ethers.getContractFactory("Factory");
        factoryImplementation = await Factory.deploy();

        const Lock = await ethers.getContractFactory("Lock");
        lockImplementation = await Lock.deploy(defaultBondingCurveSettings.positionManager);

        const TokenImplementation = await ethers.getContractFactory("TokenImplementation");
        tokenImplementation = await TokenImplementation.deploy();

        const BondingCurve = await ethers.getContractFactory("BondingCurve");
        bondingCurveImplementation = await BondingCurve.deploy();

        // Deploy Foundry with implementations
        const Foundry = await ethers.getContractFactory("Foundry");
        foundry = await Foundry.deploy(
            await factoryImplementation.getAddress(),
            await lockImplementation.getAddress(),
            await tokenImplementation.getAddress(),
            await bondingCurveImplementation.getAddress(),
            INITIAL_FEE
        );

        return {
            foundry,
            factoryImplementation,
            lockImplementation,
            tokenImplementation,
            bondingCurveImplementation,
            owner,
            user1,
            user2
        };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployFoundryFixture);
        foundry = fixture.foundry;
        factoryImplementation = fixture.factoryImplementation;
        lockImplementation = fixture.lockImplementation;
        tokenImplementation = fixture.tokenImplementation;
        bondingCurveImplementation = fixture.bondingCurveImplementation;
        owner = fixture.owner;
        user1 = fixture.user1;
        user2 = fixture.user2;
    });

    describe("Initialization", function () {
        it("should initialize with correct implementation addresses", async function () {
            expect(await foundry.getFactoryImplementation()).to.equal(
                await factoryImplementation.getAddress()
            );
            expect(await foundry.getLockImplementation()).to.equal(
                await lockImplementation.getAddress()
            );
            expect(await foundry.getTokenImplementation()).to.equal(
                await tokenImplementation.getAddress()
            );
            expect(await foundry.getBondingCurveImplementation()).to.equal(
                await bondingCurveImplementation.getAddress()
            );
        });

        it("should set the correct initial deployment fee", async function () {
            expect(await foundry.getDeploymentFee()).to.equal(INITIAL_FEE);
        });

        it("should set the correct owner", async function () {
            expect(await foundry.owner()).to.equal(owner.address);
        });
    });

    describe("System Deployment", function () {

        it("should deploy factory and lock contracts successfully", async function () {
            const settings = {
                virtualEth: ethers.parseEther("5"),
                preBondingTarget: ethers.parseEther("1"),
                bondingTarget: ethers.parseEther("30"),
                minContribution: ethers.parseEther("0.1"),
                poolFee: 3000, // 0.3%
                sellFee: 100n, // 0.3%
                uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
                positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
                weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                feeTo: owner.address
            };

            const deploymentFee = await foundry.getDeploymentFee();
            const tx = await foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, settings, {
                value: deploymentFee
            });

            const receipt = await tx.wait();
            const event = receipt.logs.find(
                log => log.fragment?.name === "SystemDeployed"
            );

            expect(event).to.not.be.undefined;
            const [factoryAddress, lockAddress] = [event.args[0], event.args[1]];

            // Get Factory interface and verify initialization
            const factory = await ethers.getContractAt("Factory", factoryAddress);
            const deployedSettings = await factory.getBondingCurveSettings();

            // Verify settings were properly set
            expect(deployedSettings.virtualEth).to.equal(settings.virtualEth);
            expect(deployedSettings.preBondingTarget).to.equal(settings.preBondingTarget);
            expect(deployedSettings.bondingTarget).to.equal(settings.bondingTarget);
            expect(deployedSettings.minContribution).to.equal(settings.minContribution);
            expect(deployedSettings.poolFee).to.equal(settings.poolFee);
            expect(deployedSettings.uniswapV3Factory).to.equal(settings.uniswapV3Factory);
            expect(deployedSettings.positionManager).to.equal(settings.positionManager);
            expect(deployedSettings.weth).to.equal(settings.weth);
            expect(deployedSettings.feeTo).to.equal(settings.feeTo);

            // Verify deployed contracts are tracked
            expect(await foundry.isDeployedClone(factoryAddress)).to.be.true;
            expect(await foundry.isDeployedClone(lockAddress)).to.be.true;
        });

        it("should revert deployment with insufficient fee", async function () {
            const deploymentFee = await foundry.getDeploymentFee();
            const insufficientFee = deploymentFee - 1n;

            await expect(
                foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                    value: insufficientFee
                })
            ).to.be.revertedWithCustomError(
                foundry,
                "InsufficientDeploymentFee"
            );
        });

        it("should refund excess deployment fee", async function () {
            const deploymentFee = await foundry.getDeploymentFee();
            const excessFee = deploymentFee + ethers.parseEther("1");

            const initialBalance = await ethers.provider.getBalance(user1.address);

            const tx = await foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                value: excessFee
            });
            const receipt = await tx.wait();

            const finalBalance = await ethers.provider.getBalance(user1.address);
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // User should receive excess fee back minus gas costs
            const expectedBalance = initialBalance - deploymentFee - gasUsed;
            expect(finalBalance).to.be.closeTo(expectedBalance, ethers.parseEther("0.01"));
        });

        it("should revert deployment with zero address owner", async function () {
            const deploymentFee = await foundry.getDeploymentFee();
            await expect(
                foundry.deploySystem(ethers.ZeroAddress, INITIAL_FEE, defaultBondingCurveSettings, {
                    value: deploymentFee
                })
            ).to.be.revertedWithCustomError(foundry, "ZeroAddress");
        });
    });

    describe("Implementation Updates", function () {
        it("should allow owner to update factory implementation", async function () {
            const newImpl = await (await ethers.getContractFactory("Factory")).deploy();

            await expect(foundry.updateImplementation("factory", await newImpl.getAddress()))
                .to.emit(foundry, "ImplementationUpdated")
                .withArgs(
                    "factory",
                    await factoryImplementation.getAddress(),
                    await newImpl.getAddress()
                );

            expect(await foundry.getFactoryImplementation()).to.equal(
                await newImpl.getAddress()
            );
        });

        it("should revert implementation update with invalid type", async function () {
            const newImpl = await (await ethers.getContractFactory("Factory")).deploy();

            await expect(
                foundry.updateImplementation("invalid", await newImpl.getAddress())
            ).to.be.revertedWithCustomError(
                foundry,
                "InvalidImplementationType"
            );
        });

        it("should revert implementation update from non-owner", async function () {
            const newImpl = await (await ethers.getContractFactory("Factory")).deploy();

            await expect(
                foundry.connect(user1).updateImplementation(
                    "factory",
                    await newImpl.getAddress()
                )
            ).to.be.revertedWithCustomError(foundry, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });


        it("should revert implementation update with zero address", async function () {
            await expect(
                foundry.updateImplementation("factory", ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(foundry, "ZeroAddress");
        });
    });

    describe("Fee Management", function () {
        it("should allow owner to update deployment fee", async function () {
            const newFee = ethers.parseEther("0.2");

            await expect(foundry.updateDeploymentFee(newFee))
                .to.emit(foundry, "DeploymentFeeUpdated")
                .withArgs(INITIAL_FEE, newFee);

            expect(await foundry.getDeploymentFee()).to.equal(newFee);
        });

        it("should allow owner to withdraw fees", async function () {
            // Deploy a system to accumulate fees
            await foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                value: INITIAL_FEE
            });

            const initialBalance = await ethers.provider.getBalance(user2.address);

            await expect(foundry.withdrawFees(user2.address))
                .to.emit(foundry, "FeesWithdrawn")
                .withArgs(user2.address, INITIAL_FEE);

            const finalBalance = await ethers.provider.getBalance(user2.address);
            expect(finalBalance).to.equal(initialBalance + INITIAL_FEE);
        });

        it("should revert fee withdrawal with zero address", async function () {
            await expect(
                foundry.withdrawFees(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(foundry, "ZeroAddress");
        });

        it("should revert fee withdrawal when no fees available", async function () {
            await expect(
                foundry.withdrawFees(user2.address)
            ).to.be.revertedWithCustomError(foundry, "NoFeesToWithdraw");
        });

        it("should revert fee updates from non-owner", async function () {
            await expect(
                foundry.connect(user1).updateDeploymentFee(ethers.parseEther("0.2"))
            ).to.be.revertedWithCustomError(foundry, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("Pausability", function () {
        it("should allow owner to pause and unpause", async function () {
            await foundry.pause();
            expect(await foundry.paused()).to.be.true;

            // Deployment should fail while paused
            await expect(
                foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                    value: INITIAL_FEE
                })
            ).to.be.revertedWithCustomError(foundry, "EnforcedPause");

            await foundry.unpause();
            expect(await foundry.paused()).to.be.false;

            // Deployment should succeed after unpause
            await expect(
                foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                    value: INITIAL_FEE
                })
            ).to.not.be.reverted;
        });

        it("should revert pause/unpause from non-owner", async function () {
            await expect(
                foundry.connect(user1).pause()
            ).to.be.revertedWithCustomError(foundry, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);

            await foundry.pause();

            await expect(
                foundry.connect(user1).unpause()
            ).to.be.revertedWithCustomError(foundry, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("Clone Tracking", function () {
        it("should correctly track deployed clones", async function () {
            const tx = await foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                value: INITIAL_FEE
            });
            const receipt = await tx.wait();

            const event = receipt.logs.find(
                log => log.fragment?.name === "SystemDeployed"
            );
            const [factoryAddress, lockAddress] = [event.args[0], event.args[1]];

            expect(await foundry.isDeployedClone(factoryAddress)).to.be.true;
            expect(await foundry.isDeployedClone(lockAddress)).to.be.true;
            expect(await foundry.isDeployedClone(ethers.ZeroAddress)).to.be.false;
        });

        it("should maintain correct clone tracking after multiple deployments", async function () {
            const deployments = [];

            // Deploy three systems
            for (let i = 0; i < 3; i++) {
                const tx = await foundry.connect(user1).deploySystem(user1.address, INITIAL_FEE, defaultBondingCurveSettings, {
                    value: INITIAL_FEE
                });
                const receipt = await tx.wait();
                const event = receipt.logs.find(
                    log => log.fragment?.name === "SystemDeployed"
                );
                deployments.push({
                    factory: event.args[0],
                    lock: event.args[1]
                });
            }

            // Verify all deployments are tracked
            for (const deployment of deployments) {
                expect(await foundry.isDeployedClone(deployment.factory)).to.be.true;
                expect(await foundry.isDeployedClone(deployment.lock)).to.be.true;
            }
        });
    });
});