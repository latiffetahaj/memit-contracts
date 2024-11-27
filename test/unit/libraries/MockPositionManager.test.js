const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockPositionManager", function () {
    let mockPositionManager;
    let owner;
    let user1;
    let user2;

    // Create MAX_UINT128 constant
    const MAX_UINT128 = BigInt(2 ** 128) - BigInt(1);

    async function deployFixture() {
        [owner, user1, user2] = await ethers.getSigners();

        const MockPositionManager = await ethers.getContractFactory("MockPositionManager");
        mockPositionManager = await MockPositionManager.deploy();
        await mockPositionManager.waitForDeployment();

        return { mockPositionManager, owner, user1, user2 };
    }

    beforeEach(async function () {
        ({ mockPositionManager, owner, user1, user2 } = await loadFixture(deployFixture));
    });

    describe("Initialization", function () {
        it("should initialize with correct name and symbol", async function () {
            expect(await mockPositionManager.name()).to.equal("Mock Uniswap V3 Positions NFT");
            expect(await mockPositionManager.symbol()).to.equal("UNI-V3-POS");
        });
    });

    describe("Minting", function () {
        it("should mint NFT with correct position details", async function () {
            const tokenId = 1;
            await mockPositionManager.mint(user1.address, tokenId);

            expect(await mockPositionManager.ownerOf(tokenId)).to.equal(user1.address);

            const position = await mockPositionManager.positions(tokenId);
            expect(position.tickLower).to.equal(-887272);
            expect(position.tickUpper).to.equal(887272);
            expect(position.liquidity).to.equal(1000);
        });
    });

    describe("Fee Management", function () {
        const tokenId = 1;

        beforeEach(async function () {
            await mockPositionManager.mint(user1.address, tokenId);
        });


        it("should set and collect fees correctly", async function () {
            const amount0 = ethers.parseEther("1");
            const amount1 = ethers.parseEther("2");

            await mockPositionManager.setFees(tokenId, amount0, amount1);

            // Approve mock manager to handle NFT
            await mockPositionManager.connect(user1).approve(owner.address, tokenId);

            const collectParams = {
                tokenId,
                recipient: user1.address,
                amount0Max: MAX_UINT128,
                amount1Max: MAX_UINT128
            };

            // First use callStatic to get the expected return values
            const expected = await mockPositionManager.collect.staticCall(collectParams);
            expect(expected[0]).to.equal(amount0);
            expect(expected[1]).to.equal(amount1);

            // Then perform the actual collection
            await mockPositionManager.collect(collectParams);

            // Verify fees were reset
            const position = await mockPositionManager.positions(tokenId);
            expect(position.tokensOwed0).to.equal(0);
            expect(position.tokensOwed1).to.equal(0);
        });

        it("should not allow unauthorized fee collection", async function () {
            await mockPositionManager.setFees(tokenId, 100, 200);

            const collectParams = {
                tokenId,
                recipient: user2.address,
                amount0Max: MAX_UINT128,
                amount1Max: MAX_UINT128
            };

            await expect(
                mockPositionManager.connect(user2).collect(collectParams)
            ).to.be.revertedWith("Not approved");
        });
    });

    describe("Approvals and Transfers", function () {
        const tokenId = 1;

        beforeEach(async function () {
            await mockPositionManager.mint(user1.address, tokenId);
        });

        it("should handle approvals correctly", async function () {
            await mockPositionManager.connect(user1).approve(user2.address, tokenId);
            expect(await mockPositionManager.getApproved(tokenId)).to.equal(user2.address);
        });

        it("should handle transfers correctly", async function () {
            await mockPositionManager.connect(user1).transferFrom(user1.address, user2.address, tokenId);
            expect(await mockPositionManager.ownerOf(tokenId)).to.equal(user2.address);
        });

        it("should handle approval for all correctly", async function () {
            await mockPositionManager.connect(user1).setApprovalForAll(user2.address, true);
            // eslint-disable-next-line no-unused-expressions
            expect(await mockPositionManager.isApprovedForAll(user1.address, user2.address)).to.be.true;
        });
    });

    describe("Edge Cases", function () {
        it("should handle multiple positions for same owner", async function () {
            await mockPositionManager.mint(user1.address, 1);
            await mockPositionManager.mint(user1.address, 2);
            await mockPositionManager.mint(user1.address, 3);

            expect(await mockPositionManager.ownerOf(1)).to.equal(user1.address);
            expect(await mockPositionManager.ownerOf(2)).to.equal(user1.address);
            expect(await mockPositionManager.ownerOf(3)).to.equal(user1.address);
        });

        it("should revert on invalid token ID", async function () {
            await expect(
                mockPositionManager.positions(999)
            ).to.not.be.reverted; // Should return empty position

            await expect(
                mockPositionManager.ownerOf(999)
            ).to.be.reverted; // Should revert for non-existent token
        });
    });
});