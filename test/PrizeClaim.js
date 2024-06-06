const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers, network } = require("hardhat");




describe("PrizeFactory", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function prizeSetup() {
        // Contracts are deployed using the first signer/account by default
        const [owner, signitory, user, user1, user2] = await ethers.getSigners();
        const PrizeClaim = await ethers.getContractFactory("PrizeClaim");
        const tokenContract = await ethers.getContractFactory("PXAToken");
        const totalSupply = ethers.parseUnits("1000000", 18);
        const usdt = await tokenContract.deploy(
            'Pixa',
            "PXA",
            totalSupply,
            owner.address,
        );
        const prizeClaim = await PrizeClaim.deploy(owner.address, signitory.address, usdt.target);
        await usdt.transfer(prizeClaim.target, ethers.parseEther('1000'));
        return {
            prizeClaim, usdt, owner, signitory, user, user1, user2
        };
    }





    describe("Gassless Prize Contract", function () {

        it("It change Settings", async function () {
            const { prizeClaim, user } = await loadFixture(prizeSetup);
            await expect(prizeClaim.changeSigner(user.address)).not.to.be.reverted;

        });

        it("It should accept valid withdrawals and send prize", async function () {
            const { prizeClaim, user2, signitory, usdt } = await loadFixture(prizeSetup);
            const amount = ethers.parseUnits('0.1', 18);
            const uuid = (await time.latest()) + (60 * 60 * 24);
            const domain = {
                name: 'PrizeClaim',
                version: "1",
                chainId: network.config.chainId,
                verifyingContract: prizeClaim.target
            };
            const types = {
                PRIZE: [
                    { name: 'to', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'uuid', type: 'uint256' }
                ]
            };
            const prize = {
                to: user2.address,
                amount,
                uuid
            };
            const signature = await signitory.signTypedData(domain, types, prize);
            const digest = ethers.TypedDataEncoder.hash(domain, types, prize);
            console.log(digest);
            await expect(() => prizeClaim.withdrawPrize(prize, signature))
                .to
                .changeTokenBalance(usdt, user2, amount);
        });

        it("It should emit Withdraw Event on valid withdrawals", async function () {
            const { prizeClaim, user2, signitory, owner } = await loadFixture(prizeSetup);
            const amount = ethers.parseUnits('0.1', 18);
            const uuid = (await time.latest()) + (60 * 60 * 24);
            const domain = {
                name: 'PrizeClaim',
                version: "1",
                chainId: network.config.chainId,
                verifyingContract: prizeClaim.target
            };
            const types = {
                PRIZE: [
                    { name: 'to', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'uuid', type: 'uint256' }
                ]
            };
            const prize = {
                to: user2.address,
                amount,
                uuid
            };
            const signature = await signitory.signTypedData(domain, types, prize);
            const digest = ethers.TypedDataEncoder.hash(domain, types, prize);
            console.log(digest);
            await expect(prizeClaim.withdrawPrize(prize, signature))
                .to
                .emit(prizeClaim, 'Withdraw')
                .withArgs(owner.address, digest, prize.to, prize.amount, prize.uuid);
        });

        it("It should reject resused valid withdrawals", async function () {
            const { prizeClaim, user2, signitory, owner } = await loadFixture(prizeSetup);
            const amount = ethers.parseUnits('0.1', 18);
            const uuid = (await time.latest()) + (60 * 60 * 24);
            console.log(network.config.chainId);
            const domain = {
                name: 'PrizeClaim',
                version: "1",
                chainId: network.config.chainId,
                verifyingContract: prizeClaim.target
            };
            const types = {
                PRIZE: [
                    { name: 'to', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'uuid', type: 'uint256' }
                ]
            };
            const prize = {
                to: user2.address,
                amount,
                uuid
            };
            const signature = await signitory.signTypedData(domain, types, prize);
            const digest = ethers.TypedDataEncoder.hash(domain, types, prize);
            console.log(digest);

            await expect(prizeClaim.withdrawPrize(prize, signature))
                .to
                .emit(prizeClaim, 'Withdraw')
                .withArgs(owner.address, digest, prize.to, prize.amount, prize.uuid);

            await expect(prizeClaim.withdrawPrize(prize, signature))
                .to
                .be
                .revertedWithCustomError(prizeClaim, 'UsedSignature');

        });



    });

});
