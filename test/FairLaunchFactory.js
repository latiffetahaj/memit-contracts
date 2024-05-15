const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");


const lpSettings = {
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    uniswap: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    oracle: '0xB210CE856631EeEB767eFa666EC7C1C57738d438'
};


describe("FairLaunchFactory", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function fairFactoryFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner] = await ethers.getSigners();
        const Token = await ethers.getContractFactory("Token");
        const tokenImplemention = await Token.deploy();
        const Fairlaunch = await ethers.getContractFactory("Fairlaunch");
        const fairlaunchImplemention = await Fairlaunch.deploy();
        const FairFactory = await ethers.getContractFactory("FairFactory");
        const factory = await FairFactory.deploy(
            owner.address,
            tokenImplemention.target,
            fairlaunchImplemention.target,
        );
        return {
            factory, tokenImplemention, fairlaunchImplemention, owner
        };
    }


    async function fairlaunchFixture() {
        const { factory, owner } = await fairFactoryFixture();
        // forking mainnet => https://docs.uniswap.org/contracts/v3/reference/deployments;
        const pepeSettings = {
            name: 'Pepe',
            symbol: "PEPE",
            supply: ethers.parseEther('21000000'),
            weth: lpSettings.weth,
            uniswap: lpSettings.uniswap
        };
        const [, team] = await ethers.getSigners();
        const teamFactory = factory.connect(team);
        const tx = await teamFactory.create(pepeSettings, {
            value: ethers.parseEther('0.05'),
        });
        const receipt = await tx.wait();
        const event = receipt.logs.find((x) => x.eventName === "CLONE");
        const fairAddress = event?.args?.fairlaunch;
        const pepeAddress = event?.args?.token;


        const presale = (await ethers.getContractAt("Fairlaunch", fairAddress))
            .connect(owner);
        const pepe = (await ethers.getContractAt("Token", pepeAddress))
            .connect(owner);
        return { presale, pepe, teamFactory, factory, owner, team };
    }

    async function addLiquidityFixture() {
        const { presale, pepe, teamFactory, factory, owner, team } = await fairlaunchFixture();
        const [, , user, user2, user3, user4] = await ethers.getSigners();
        // forking mainnet => https://docs.uniswap.org/contracts/v3/reference/deployments;
        const amounts = {
            user: ethers.parseEther("0.2"),
            user2: ethers.parseEther("0.4"),
            user3: ethers.parseEther("0.8"),
            user4: ethers.parseEther("1"),
        };
        await presale.connect(user).contribute({
            value: amounts.user,
        });
        await presale.connect(user2).contribute({
            value: amounts.user2,
        });
        await presale.connect(user3).contribute({
            value: amounts.user3
        });
        await presale.connect(user4).contribute({
            value: amounts.user4
        });
        return { presale, pepe, teamFactory, factory, owner, team, amounts, user, user2, user3, user4 };
    }


    describe("Factory Setup", function () {
        it("Set the correct fees and implementations", async function () {
            const { factory, tokenImplemention, fairlaunchImplemention } = await loadFixture(fairFactoryFixture);
            expect(await factory.tokenImplementation()).to.equal(tokenImplemention.target);
            expect(await factory.fairLaunchImplementation()).to.equal(fairlaunchImplemention.target);
            expect(await factory.fees()).to.equal(ethers.parseEther('0.05'));
            await expect(factory.updateFees(ethers.parseEther('0.08'))).not.to.be.reverted;
            expect(await factory.fees()).to.equal(ethers.parseEther('0.08'));
        });

        it("BetManager Should deploy A launchpad and token", async function () {
            const { presale, pepe, owner, team } = await loadFixture(fairlaunchFixture);
            // check token
            expect(await pepe.totalSupply()).to.equal(ethers.parseEther('21000000'));
            expect(await pepe.name()).to.equal('Pepe');
            expect(await pepe.symbol()).to.equal('PEPE');

            // check setup of 
            // function initialize(Setting calldata config) public initializer 

            const twentyFiveDaysLater = (await time.latest()) + (60 * 60 * 24 * 25);
            const info = await presale.tokenomics();
            const settings = await presale.settings();
            const tbal = ethers.parseEther('21000000');
            expect(info.membersAllocation).to.be.eq(tbal / 2n);
            expect(info.liquidityAllocation).to.be.eq((4000n * tbal) / 10000n);
            expect(info.teamAllocation).to.be.eq((1000n * tbal) / 10000n);
            expect(await presale.claimDate(team.address)).to.be.gte(twentyFiveDaysLater);
            const tenDaysLater = (await time.latest()) + (60 * 60 * 24 * 10);
            expect(settings.lpAdded).to.be.eq(false);
            expect(settings.sleepfinance).to.be.eq(owner.address);
            expect(settings.team).to.be.eq(team.address);
            expect(settings.token).to.be.eq(pepe.target);
            expect(settings.weth).to.be.eq(lpSettings.weth);
            expect(settings.uniswap).to.be.eq(lpSettings.uniswap);
            expect(settings.endTime).to.be.gte(tenDaysLater);
        });
    });

    describe("FairFactory", function () {
        it("it should => function contribute() external payable", async function () {
            const { presale } = await loadFixture(fairlaunchFixture);
            const [, , user, user2, user3] = await ethers.getSigners();
            await presale.connect(user).contribute({
                value: ethers.parseEther("0.1"),
            });
            await presale.connect(user2).contribute({
                value: ethers.parseEther("0.2"),
            });
            await presale.connect(user3).contribute({
                value: ethers.parseEther("0.3"),
            });
            expect(await presale.contributions(user2.address)).to.be.eq(ethers.parseEther("0.2"));
            expect(await ethers.provider.getBalance(presale.target)).to.be.eq(ethers.parseEther("0.6"));

        });

        it("it should => function addLiquidity()  and send team fees", async function () {
            const { presale, owner, team } = await loadFixture(addLiquidityFixture);
            const total = await ethers.provider.getBalance(presale.target);
            const teamAmount = (1000n * total) / 10000n;
            const sleepAmount = (500n * total) / 10000n;
            const config = await presale.settings();
            // end the sale
            await time.increaseTo(config.endTime + 1800n);
            await expect(presale.addLiquidity()).to.changeEtherBalances([team.address, owner.address], [teamAmount, sleepAmount]);
            const settings = await presale.settings();
            expect(settings.lpAdded).to.be.eq(true);
            expect(await presale.pool()).not.to.be.eq(ethers.ZeroAddress);
            expect(await presale.tokenId()).not.to.be.eq(0);
        });

        it("it should => function claim() external", async function () {
            const { presale, pepe, amounts, user3, user4 } = await loadFixture(addLiquidityFixture);
            const config = await presale.settings();
            // end the sale
            await time.increaseTo(config.endTime + 1800n);
            await presale.addLiquidity();
            const tokenomics = await presale.tokenomics();
            const u4ClaimDate = await presale.claimDate(user4.address);
            // ensure claimdates are passes
            await time.increaseTo(u4ClaimDate + 1800n);
            const user3Claim = (amounts.user3 * tokenomics.membersAllocation) / tokenomics.totalContribution;
            const user4laim = (amounts.user4 * tokenomics.membersAllocation) / tokenomics.totalContribution;
            await expect(presale.connect(user3).claim()).to.changeTokenBalance(pepe, user3.address, user3Claim);
            await expect(presale.connect(user4).claim()).to.changeTokenBalance(pepe, user4.address, user4laim);
        });

        it("it should => function teamClaim() external", async function () {
            const { presale, pepe, team } = await loadFixture(addLiquidityFixture);
            const config = await presale.settings();
            // end the sale
            await time.increaseTo(config.endTime + 1800n);
            await presale.addLiquidity();
            const tokenomics = await presale.tokenomics();
            const teamClaim = await presale.claimDate(team.address);
            // ensure claimdates are passes
            await time.increaseTo(teamClaim + 1800n);
            await expect(presale.connect(team).teamClaim()).to.changeTokenBalance(pepe, team.address, tokenomics.teamAllocation);
        });
    });

});
