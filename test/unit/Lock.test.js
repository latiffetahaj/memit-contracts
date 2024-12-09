/* eslint-disable no-unused-expressions */
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Lock Contract", function () {
    // Test variables

    // Test variables
    let owner;
    let user1;
    let user2;
    let lock;
    let lockImplementation;
    let mockNFTManager;
    let mockToken0;
    let mockToken1;

    const LOCK_DURATION = 3650 * 24 * 60 * 60; // 10 years in seconds


    async function deployLockFixture() {
        // Get signers
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock NFT manager
        const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
        mockNFTManager = await MockPositionManager.deploy();
        await mockNFTManager.waitForDeployment();

        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("TestToken");
        mockToken0 = await MockToken.deploy("Mock Token 0", "MT0");
        mockToken1 = await MockToken.deploy("Mock Token 1", "MT1");
        await mockToken0.waitForDeployment();
        await mockToken1.waitForDeployment();

        // Deploy Lock implementation
        const Lock = await ethers.getContractFactory("Lock");
        lockImplementation = await Lock.deploy(mockNFTManager.target);
        await lockImplementation.waitForDeployment();

        // Create minimal proxy bytecode
        const implementationAddress = await lockImplementation.getAddress();

        // Create proxy bytecode (EIP-1167)
        const constructorByteCode = '3d602d80600a3d3981f3363d3d373d3d3d363d73';
        const deploymentByteCode = '5af43d82803e903d91602b57fd5bf3';

        // Remove '0x' prefix and ensure address is lowercase
        const addr = implementationAddress.slice(2).toLowerCase();

        const proxyBytecode = '0x' + constructorByteCode + addr + deploymentByteCode;

        // Deploy proxy
        const tx = await owner.sendTransaction({
            data: proxyBytecode
        });
        const receipt = await tx.wait();
        const proxyAddress = receipt.contractAddress;

        // Get Lock interface for the proxy
        lock = await ethers.getContractAt("Lock", proxyAddress);

        // Initialize the proxy
        await lock.initialize();

        return { lock, mockNFTManager, mockToken0, mockToken1, owner, user1, user2 };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployLockFixture);
        lock = fixture.lock;
        mockNFTManager = fixture.mockNFTManager;
        mockToken0 = fixture.mockToken0;
        mockToken1 = fixture.mockToken1;
        owner = fixture.owner;
        user1 = fixture.user1;
        user2 = fixture.user2;
    });

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            expect(await lock.owner()).to.equal(owner.address);
        });

        it("should not allow reinitialization", async function () {
            await expect(lock.initialize())
                .to.be.revertedWithCustomError(lock, "InvalidInitialization");
        });

        it("should set correct UNISWAP_V3_POSITION_MANAGER address", async function () {
            expect(await lock.UNISWAP_V3_POSITION_MANAGER()).to.equal(
                await mockNFTManager.getAddress() // Use our mock contract address instead of mainnet address
            );
        });
    });


    describe("NFT Locking", function () {
        const tokenId = 1n;

        beforeEach(async function () {
            // Mint NFT to user1
            await mockNFTManager.mint(user1.address, tokenId);
            // Approve Lock contract

            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
        });

        it("should successfully lock an NFT", async function () {
            await lock.connect(user1).lockNFT(tokenId, user1.address);

            const lockedNFT = await lock.lockedNFTs(tokenId);
            expect(lockedNFT.owner).to.equal(user1.address);
            expect(lockedNFT.isLocked).to.be.true;
            expect(lockedNFT.tokenId).to.equal(tokenId);

            const ownerNFTs = await lock.getNFTsByOwner(user1.address);
            expect(ownerNFTs).to.include(tokenId);
        });

        it("should emit NFTLocked event", async function () {
            await expect(lock.connect(user1).lockNFT(tokenId, user1.address))
                .to.emit(lock, "NFTLocked")
                .withArgs(user1.address, tokenId);
        });

        it("should not allow locking already locked NFT", async function () {
            await lock.connect(user1).lockNFT(tokenId, user1.address);
            await expect(lock.connect(user1).lockNFT(tokenId, user1.address))
                .to.be.revertedWithCustomError(lock, "NFTAlreadyLocked");
        });

        it("should track multiple NFTs per owner", async function () {
            const tokenId2 = 2n;
            await mockNFTManager.mint(user1.address, tokenId2);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId2);

            await lock.connect(user1).lockNFT(tokenId, user1.address);
            await lock.connect(user1).lockNFT(tokenId2, user1.address);

            const ownerNFTs = await lock.getNFTsByOwner(user1.address);
            expect(ownerNFTs).to.have.lengthOf(2);
            expect(ownerNFTs).to.include(tokenId);
            expect(ownerNFTs).to.include(tokenId2);
        });
    });

    describe("NFT Unlocking", function () {
        const tokenId = 1n;

        beforeEach(async function () {
            await mockNFTManager.mint(user1.address, tokenId);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
            await lock.connect(user1).lockNFT(tokenId, user1.address);
        });

        it("should not allow unlocking before lock period ends", async function () {
            await expect(lock.connect(user1).unlockNFT(tokenId, user1.address))
                .to.be.revertedWithCustomError(lock, "LockPeriodNotEnded");
        });

        it("should allow unlocking after lock period", async function () {
            await time.increase(LOCK_DURATION + 1);

            await expect(lock.connect(user1).unlockNFT(tokenId, user1.address))
                .to.emit(lock, "NFTUnlocked")
                .withArgs(user1.address, tokenId, user1.address);

            const lockedNFT = await lock.lockedNFTs(tokenId);
            expect(lockedNFT.isLocked).to.be.false;

            const ownerNFTs = await lock.getNFTsByOwner(user1.address);
            expect(ownerNFTs).to.not.include(tokenId);
        });

        it("should not allow non-owner to unlock", async function () {
            await time.increase(LOCK_DURATION + 1);
            await expect(lock.connect(user2).unlockNFT(tokenId, user1.address))
                .to.be.revertedWithCustomError(lock, "NotNFTOwner");
        });
    });

    describe("Fee Management", function () {
        const tokenId = 1n;

        beforeEach(async function () {
            await mockNFTManager.mint(user1.address, tokenId);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
            await lock.connect(user1).lockNFT(tokenId, user1.address);
        });

        it("should allow fee claiming by NFT owner", async function () {
            // Mock fee accumulation
            await mockNFTManager.setFees(tokenId, ethers.parseEther("1"), ethers.parseEther("2"));

            const tx = await lock.connect(user1).claimFees(tokenId);

            await expect(tx)
                .to.emit(lock, "FeesClaimed")
                .withArgs(
                    user1.address,
                    tokenId,
                    ethers.parseEther("1"),
                    ethers.parseEther("2")
                );
        });

        it("should not allow fee claiming by non-owner", async function () {
            await expect(
                lock.connect(user2).claimFees(tokenId)
            ).to.be.revertedWithCustomError(lock, "NotNFTOwner");
        });



        it("should not allow checking fees for non-locked NFTs", async function () {
            const nonLockedTokenId = 2;
            await expect(lock.checkAvailableFees(nonLockedTokenId))
                .to.be.revertedWithCustomError(lock, "NFTNotLocked");
        });
    });

    describe("Utility Functions", function () {
        const tokenId = 1;

        beforeEach(async function () {
            await mockNFTManager.mint(user1.address, tokenId);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
        });

        it("should correctly check if NFT is locked", async function () {
            expect(await lock.isNFTLocked(tokenId)).to.be.false;

            await lock.connect(user1).lockNFT(tokenId, user1.address);
            expect(await lock.isNFTLocked(tokenId)).to.be.true;
        });

        it("should correctly calculate remaining lock time", async function () {
            await lock.connect(user1).lockNFT(tokenId, user1.address);

            const remainingTime = await lock.getRemainingLockTime(tokenId);
            expect(remainingTime).to.be.closeTo(BigInt(LOCK_DURATION), BigInt(5)); // Allow small deviation due to block time

            await time.increase(LOCK_DURATION / 2);
            const halfTime = await lock.getRemainingLockTime(tokenId);
            expect(halfTime).to.be.closeTo(BigInt(LOCK_DURATION / 2), BigInt(5));
        });

        it("should return 0 remaining time for unlocked NFTs", async function () {
            expect(await lock.getRemainingLockTime(tokenId)).to.equal(0);
        });

        it("should return 0 remaining time after lock period ends", async function () {
            await lock.connect(user1).lockNFT(tokenId, user1.address);
            await time.increase(LOCK_DURATION + 1);
            expect(await lock.getRemainingLockTime(tokenId)).to.equal(0);
        });
    });

    describe("Edge Cases and Security", function () {
        const tokenId = 1;

        it("should handle multiple locks and unlocks correctly", async function () {
            // First lock cycle
            await mockNFTManager.mint(user1.address, tokenId);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
            await lock.connect(user1).lockNFT(tokenId, user1.address);

            await time.increase(LOCK_DURATION + 1);
            await lock.connect(user1).unlockNFT(tokenId, user1.address);

            // Second lock cycle
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
            await lock.connect(user1).lockNFT(tokenId, user1.address);

            expect(await lock.isNFTLocked(tokenId)).to.be.true;
        });

        it("should handle NFT transfers correctly", async function () {
            await mockNFTManager.mint(user1.address, tokenId);
            await mockNFTManager.connect(user1).approve(lock.target, tokenId);
            await lock.connect(user1).lockNFT(tokenId, user1.address);

            // Verify NFT is in lock contract
            expect(await mockNFTManager.ownerOf(tokenId)).to.equal(lock.target);

            // Complete lock period and unlock
            await time.increase(LOCK_DURATION + 1);
            await lock.connect(user1).unlockNFT(tokenId, user1.address);

            // Verify NFT returned to original owner
            expect(await mockNFTManager.ownerOf(tokenId)).to.equal(user1.address);
        });

        it("should maintain correct owner list after multiple operations", async function () {
            // Setup multiple NFTs
            const tokenIds = [1n, 2n, 3n];
            for (const id of tokenIds) {
                await mockNFTManager.mint(user1.address, id);
                await mockNFTManager.connect(user1).approve(lock.target, id);
                await lock.connect(user1).lockNFT(id, user1.address);
            }

            // Verify initial state
            let ownerNFTs = await lock.getNFTsByOwner(user1.address);
            expect(ownerNFTs).to.have.lengthOf(3);

            // Unlock middle NFT
            await time.increase(LOCK_DURATION + 1);
            await lock.connect(user1).unlockNFT(2, user1.address);

            // Verify updated state
            ownerNFTs = await lock.getNFTsByOwner(user1.address);
            expect(ownerNFTs).to.have.lengthOf(2);
            expect(ownerNFTs).to.include(1n);
            expect(ownerNFTs).to.include(3n);
            expect(ownerNFTs).to.not.include(2n);
        });
    });
});