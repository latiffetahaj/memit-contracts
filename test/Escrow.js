const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers, network } = require("hardhat");




describe("EscrowFactory", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function escrowFactoryFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner] = await ethers.getSigners();
        const Escrow = await ethers.getContractFactory("SleepEscrow");
        const escrowImplemention = await Escrow.deploy();
        const escrowFactory = await ethers.getContractFactory("EscrowFactory");
        const factory = await escrowFactory.deploy(
            owner.address,
            escrowImplemention.target,
        );
        return {
            factory, escrowImplemention, owner
        };
    }


    async function escrowFixture() {
        const { factory, owner } = await escrowFactoryFixture();
        const now = await time.latest();
        const [, , payer, payee] = await ethers.getSigners();
        const sleepfinanceAddress = '0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6';
        //  impersonating sleepfinance
        const sleepfinance = await ethers.getImpersonatedSigner(sleepfinanceAddress);
        await owner.sendTransaction({
            value: ethers.parseEther('3'),
            to: sleepfinanceAddress
        });
        // forking mainnet => https://docs.uniswap.org/contracts/v3/reference/deployments;
        const config = {
            locked: false,
            amount: ethers.parseEther('0.1'),
            releaseDate: now + (60 * 60 * 24),
            token: ethers.ZeroAddress,
            payer: payer.address,
            payee: payee.address
        };

        const tx = await factory.connect(payer).create(config, {
            value: ethers.parseEther('0.005') + config.amount,
        });
        const receipt = await tx.wait();
        const event = receipt.logs.find((x) => x.eventName === "CLONE");
        const escrowAddress = event?.args?.escrow;
        const escrow = (await ethers.getContractAt("SleepEscrow", escrowAddress))
            .connect(sleepfinance);

        return { escrow, factory, owner, config, payer, payee };
    }



    describe("Factory Setup", function () {
        it("Set the correct fees and implementations", async function () {
            const { factory, escrowImplemention } = await loadFixture(escrowFactoryFixture);
            expect(await factory.escrowImplementation()).to.equal(escrowImplemention.target);
            expect(await factory.fees()).to.equal(ethers.parseEther('0.005'));
            await expect(factory.updateFees(ethers.parseEther('0.008'))).not.to.be.reverted;
            expect(await factory.fees()).to.equal(ethers.parseEther('0.008'));
        });

        it("Should deploy an escrow", async function () {
            const { escrow, config } = await loadFixture(escrowFixture);
            // check token
            const total = await ethers.provider.getBalance(escrow.target);
            expect(total).to.equal(config.amount);
            const escrowConfig = await escrow.escrow();
            expect(escrowConfig.payee).to.equal(config.payee);
            expect(escrowConfig.payer).to.equal(config.payer);
        });
    });

    describe("Escrow", function () {
        it("it should => function setLock(bool status) external onlyPayer", async function () {
            const { escrow, payer } = await loadFixture(escrowFixture);
            await expect(escrow.connect(payer).setLock(true)).not.to.be.reverted;
            const config = await escrow.escrow();
            expect(config.locked).to.be.eq(true);
            await expect(escrow.connect(payer).setLock(false)).not.to.be.reverted;
            const config2 = await escrow.escrow();
            expect(config2.locked).to.be.eq(false);
        });

        it("it should => function release() external onlyPayer", async function () {
            const { escrow, payer, payee, config } = await loadFixture(escrowFixture);
            await expect(escrow.connect(payer).setLock(true)).not.to.be.reverted;
            await expect(escrow.connect(payee).claim()).to.be.revertedWithCustomError(escrow, 'EscrowIsLocked');
            await expect(escrow.connect(payer).release()).not.to.be.reverted;
            const config2 = await escrow.escrow();
            expect(config2.locked).to.be.eq(false);
            await network.provider.send('evm_mine', []);
            await expect(escrow.connect(payee).claim()).to.changeEtherBalance(payee, (config.amount * 9700n) / 10000n);
        });

        it("it should => function claim() after expiry ends", async function () {
            const { escrow, payee, config } = await loadFixture(escrowFixture);
            // end the sale
            await time.increaseTo(config.releaseDate + 1800);
            await expect(escrow.connect(payee).claim()).to.changeEtherBalance(payee, (config.amount * 9700n) / 10000n);

        });

        it("it should => settle(bool toPayee) after expiry", async function () {
            const { escrow, payer, payee, config } = await loadFixture(escrowFixture);
            await expect(escrow.connect(payer).setLock(true)).not.to.be.reverted;
            // ensure claimdates are passes
            await time.increaseTo(config.releaseDate + 1800);
            await expect(escrow.connect(payee).claim()).to.be.revertedWithCustomError(escrow, 'EscrowIsLocked');
            await expect(escrow.settle(true)).to.changeEtherBalance(payee, (config.amount * 9700n) / 10000n);
        });
        it("it should => settle(bool toPayee) before expiry", async function () {
            const { escrow, payer, payee, config } = await loadFixture(escrowFixture);
            await expect(escrow.connect(payee).claim()).to.be.revertedWithCustomError(escrow, 'ReleaseDatePending');
            await expect(escrow.settle(false)).to.changeEtherBalance(payer, (config.amount * 9700n) / 10000n);
        });
    });

});
