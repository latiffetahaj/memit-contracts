
const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parse: uuidParse, v4: uuidv4 } = require('uuid');

const betsjson = require('../json/bets.json');
const markets = require('../json/markets.json');
const teamsJson = require('../json/teams.json');
const cases = require('../json/tests.json');

const Results = Object.freeze({
    PENDING: 0,
    HOME: 1,
    AWAY: 2,
    DRAW: 3,
    CANCELLED: 4
});
const chunk = (input, size) => {
    return input.reduce((arr, item, idx) => {
        return idx % size === 0
            ? [...arr, [item]]
            : [...arr.slice(0, -1), [...arr.slice(-1)[0], item]];
    }, []);
};

const deployMarket = async (market, manager) => {
    const mkt = markets.find(m => m.marketId === market);
    const bets = betsjson.filter(b => mkt.bets.includes(b.betId));
    await manager.storeMarkets([mkt]);
    await manager.storeBets(bets);
};

const defaultGameResult = {
    gameId: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    cancel: false,
    homeScore: 0,
    awayScore: 0,
    homeHalftimeScore: 0,
    awayHalftimeScore: 0,
};


const uuidBigInt = () => {
    const uuid = uuidv4();
    const parsed = uuidParse(uuid);
    const hex = [...parsed].map((v) => v.toString(16).padStart(2, '0')).join('');
    return BigInt('0x' + hex).toString();
};
describe("BetManager", function () {

    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployBetnFixture() {
        // Contracts are deployed using the first signer/account by default
        const [betnAdmin] = await ethers.getSigners();
        const Betn = await ethers.getContractFactory("Betn");
        const betn = await Betn.deploy(betnAdmin.address);
        return { betn, betnAdmin };
    }

    async function deployLpAdderFixture() {
        const { betn, betnAdmin } = await deployBetnFixture();
        // Contracts are deployed using the first signer/account by default
        const LiquidityAdder = await ethers.getContractFactory("LiquidityAdder");
        // forking mainnet => https://docs.uniswap.org/contracts/v3/reference/deployments;
        const lpSettings = {
            betn: betn.target,
            weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            uniswap: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
            swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
            oracle: '0xB210CE856631EeEB767eFa666EC7C1C57738d438'
        };
        const lp = await LiquidityAdder.deploy(betnAdmin.address, lpSettings);
        const minter = await betn.MINTER_ROLE();
        await betn.grantRole(minter, lp.target);
        return { betn, betnAdmin, lp, lpSettings };
    }


    async function deployTeamsFixture() {
        // Contracts are deployed using the first signer/account by default
        const { betn, betnAdmin, lp, lpSettings } = await deployLpAdderFixture();
        const [teamsOwner] = await ethers.getSigners();
        const BetNfts = await ethers.getContractFactory("BetnNfts");
        const teams = await BetNfts.deploy(
            teamsOwner.address,
            lp.target,
            ethers.parseEther('5')
        );
        return { teams, teamsOwner, betn, betnAdmin, lp, lpSettings };
    }



    async function deployBetnCommunityNftFixture() {
        const { teams, teamsOwner, betn, betnAdmin, lp, lpSettings } = await deployTeamsFixture();
        // Contracts are deployed using the first signer/account by default
        const BetnCommunityNft = await ethers.getContractFactory("BetnCommunityNft");
        const communityNft = await BetnCommunityNft.deploy(
            teamsOwner.address,
            lp.target,
            ethers.parseEther('5')
        );
        return { teams, teamsOwner, betn, betnAdmin, lp, lpSettings, communityNft };
    }




    async function deployBetManager() {
        // Contracts are deployed using the first signer/account by default
        const { teams, teamsOwner, betn, betnAdmin, lp, lpSettings, communityNft } = await deployBetnCommunityNftFixture();
        const [owner] = await ethers.getSigners();
        const BetnPOSDAO = await ethers.getContractFactory("BetnPOSDAO");
        const dao = await BetnPOSDAO.deploy(betnAdmin.address, betn.target);
        const BetManager = await ethers.getContractFactory("BetManager");
        const manager = await BetManager.deploy(owner.address, teams.target, dao.target);
        const SlipManager = await ethers.getContractFactory("SlipsManager");
        const BetnLiquidityBookie = await ethers.getContractFactory("BetnLiquidityBookie");
        const slipSettings = {
            communityNft: communityNft.target,
            teamsNft: teams.target,
            betsManager: manager.target,
            fee: 30000n,
            teamFee: 5000n, // 5% // paid to owner of winning team NFT
            bookieFee: 5000n, // 5% // paid to the game bookie
            betFee: 5000n, // 5% // paid to owner of the winning bet;
            marketFee: 5000n, // 5% // paid to owner of the winning market
            liquidityFee: 10000n// 10% // paid to BETN devs
        };
        const slips = await SlipManager.deploy(owner.address, slipSettings);
        const bookieSettings = {
            betsManager: manager.target,
            betn: betn.target,
            price: ethers.parseEther('100'),
            liquidityAdder: lp.target,
        };
        const liquidityBookie = await BetnLiquidityBookie.deploy(owner.address, bookieSettings);
        const minter = await betn.MINTER_ROLE();
        await betn.grantRole(minter, liquidityBookie.target);
        return {
            lp,
            lpSettings,
            communityNft,
            slipSettings,
            slips,
            manager,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            dao,
            liquidityBookie
        };
    }

    async function deployPosDaoFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await deployBetManager();
        // Contracts are deployed using the first signer/account by default
        const validator = await manager.VALIDATOR_ROLE();
        const minter = await betn.MINTER_ROLE();
        await manager.grantRole(validator, dao.target);
        await dao.updateBetManager(manager.target);
        await betn.grantRole(minter, dao.target);
        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };
    }

    async function setupFixure() {
        // Contracts are deployed using the first signer/account by default
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await deployBetManager();


        /* 
        To test all markets. Failing becuase tooo slow.

        const chunks = chunk(betsjson, 150);
        for (const chnk of chunks) {
            await manager.storeBets(chnk);
        }
        await manager.storeMarkets(markets);
        */
        // fixes timeout issuee temporariy. Relaces code above

        const bnbMarketId = '0x833aea91e37d4070293778c9e8c234220b2128a9fca79730f85ff4115f20ea88';
        const bnbMarketId2 = '0x384370919395be44304a2732e75c08895235c2547a4fce46d67a1cc2748ed9cf';
        await deployMarket(bnbMarketId, manager);
        await deployMarket(bnbMarketId2, manager);

        // fixes timeout issuee temporariy. Relaces code above

        const [, , , , , , , , , , , , , , manUnitedOwner, chelseaOwner, betsOWner, marketsOwner] = await ethers.getSigners();
        const manuStruct = {
            uuid: uuidBigInt(),
            "name": "Manchester United",
            "code": "MUN",
            "country": "England"
        };
        const chelseaStruct = {
            uuid: uuidBigInt(),
            "name": "Chelsea",
            "code": "CHE",
            "country": "England"
        };
        await teams.safeMint(manUnitedOwner.address, manuStruct);
        await teams.safeMint(chelseaOwner.address, chelseaStruct);
        // we shall mint all bet communityNFTs for tests to pass
        const chelsea = chelseaStruct.uuid;
        const manUnited = manuStruct.uuid;
        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            lp,
            lpSettings,
            communityNft,
            manUnitedOwner,
            chelseaOwner,
            betsOWner,
            marketsOwner,
            liquidityBookie
        };
    }

    async function gameFixture() {
        // Contracts are deployed using the first signer/account by default
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            lp,
            lpSettings,
            communityNft,
            manUnitedOwner,
            chelseaOwner,
            betsOWner,
            marketsOwner,
            liquidityBookie
        } = await setupFixure();
        const timeToStart = 60 * 60; // in one hour
        const gameTime = 100 * 60; // in one hour 100 minutes;
        const startTime = await time.latest() + timeToStart;
        const endTime = startTime + gameTime;
        const [, , , , , , , bookie] = await ethers.getSigners();
        const game = {
            homeTeam: manUnited,
            awayTeam: chelsea,
            startTime,
            endTime,
            players: [chelsea, manUnited, 4, 7, 24534, 8765],
            uuid: uuidBigInt(),
        };
        await manager.createGame(game, bookie.address);
        const gameId = game.uuid;
        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bookie,
            lp,
            lpSettings,
            communityNft,
            manUnitedOwner,
            chelseaOwner,
            betsOWner,
            marketsOwner,
            liquidityBookie
        };
    }

    async function deployPosDaoGameFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bookie,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await gameFixture();
        // Contracts are deployed using the first signer/account by default
        const validator = await manager.VALIDATOR_ROLE();
        const minter = await betn.MINTER_ROLE();
        await manager.grantRole(validator, dao.target);
        await dao.updateBetManager(manager.target);
        await betn.grantRole(minter, dao.target);
        return {
            slipSettings,
            slips,
            dao,
            manager,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bookie,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };
    }

    async function unbackedBetFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie,
        } = await gameFixture();
        const [, , , user] = await ethers.getSigners();
        const fullTimeHome = '0x247fd94705a7726a87669109aabd5f9559eead3ec732930f4c2fd0b3d0b5e4c8';
        const bnbMarketId = '0x833aea91e37d4070293778c9e8c234220b2128a9fca79730f85ff4115f20ea88';

        const bet = {
            amount: ethers.parseEther('0.01'),
            paid: 0,
            betid: fullTimeHome,
            marketId: bnbMarketId,
            gameid: gameId,
            currency: ethers.ZeroAddress,
            ref: ethers.ZeroAddress,
            uuid: uuidBigInt()
        };

        await slips.placeBet(user.address, bet, { value: bet.amount });
        const slipNftId = bet.uuid;
        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bet,
            slipNftId,
            user,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };

    }



    async function betFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await gameFixture();
        const [, , , user, user2, ref] = await ethers.getSigners();
        const fullTimeAway = '0x807f30598f3f03ba59fab8c90ac530f249b96717395e55c2888da7afb1f14e76';
        const fullTimeHome = '0x247fd94705a7726a87669109aabd5f9559eead3ec732930f4c2fd0b3d0b5e4c8';
        const bnbMarketId = '0x833aea91e37d4070293778c9e8c234220b2128a9fca79730f85ff4115f20ea88';
        const bet = {
            amount: ethers.parseEther('0.01'),
            paid: 0,
            betid: fullTimeHome,
            marketId: bnbMarketId,
            gameid: gameId,
            currency: ethers.ZeroAddress,
            ref: ref.address,
            uuid: uuidBigInt()
        };
        const bet2 = {
            amount: ethers.parseEther('0.06'),
            paid: 0,
            betid: fullTimeAway,
            marketId: bnbMarketId,
            gameid: gameId,
            currency: ethers.ZeroAddress,
            ref: ref.address,
            uuid: uuidBigInt()
        };

        await slips.placeBet(user.address, bet, { value: bet.amount });
        await slips.placeBet(user2.address, bet2, { value: bet2.amount });
        const slipNftId = bet.uuid;
        const slipNftId2 = bet2.uuid;
        const coder = ethers.AbiCoder.defaultAbiCoder();
        const slipId = ethers.keccak256(coder.encode(
            ["tuple(uint256,uint256,bytes32,bytes32,uint256,address,address,uint256)"],
            [Object.values(bet)]
        ));
        const slipId2 = ethers.keccak256(coder.encode(
            ["tuple(uint256,uint256,bytes32,bytes32,uint256,address,address,uint256)"],
            [Object.values(bet2)]
        ));
        console.log(`ContractSlipNftId2 :${slipNftId2}, slipId2 :${BigInt(slipId2).toString()},  ContractSlipNftId: ${slipNftId} slipId: ${BigInt(slipId).toString()}`);


        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bet,
            bet2,
            slipNftId,
            slipNftId2,
            user,
            user2,
            ref,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };

    }

    async function lpBookieBetFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await gameFixture();
        const [, , , user, user2, ref] = await ethers.getSigners();
        const fullTimeAway = '0x807f30598f3f03ba59fab8c90ac530f249b96717395e55c2888da7afb1f14e76';
        const fullTimeHome = '0x247fd94705a7726a87669109aabd5f9559eead3ec732930f4c2fd0b3d0b5e4c8';
        const odd1 = (Math.floor(Math.random() * 5) + 1) * 100;
        const odd2 = (Math.floor(Math.random() * 5) + 1) * 100;
        await liquidityBookie.setupGameOdds(gameId, [fullTimeAway, fullTimeHome], [odd1, odd2]);
        const bet = {
            amount: ethers.parseEther('0.01'),
            paid: 0,
            betids: [fullTimeHome],
            gameids: [gameId],
            ref: ref.address,
            isBetn: false,
            uuid: uuidBigInt()
        };
        const bet2 = {
            amount: ethers.parseEther('0.06'),
            paid: 0,
            betids: [fullTimeAway],
            gameids: [gameId],
            ref: ref.address,
            isBetn: false,
            uuid: uuidBigInt()
        };
        await liquidityBookie.placeBet(user.address, bet, { value: bet.amount });
        const slipNftId = bet.uuid;

        return {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bet,
            bet2,
            slipNftId,
            user,
            user2,
            ref,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };

    }

    async function referralManagerFixture() {
        const {
            slipSettings,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bet,
            bet2,
            slipNftId,
            slipNftId2,
            user,
            user2,
            ref,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        } = await betFixture();
        const ReferralManager = await ethers.getContractFactory('ReferralManager');
        const now = await time.latest();
        const refSettings = {
            manager: manager.target,
            betn: betn.target,
            slips: slips.target,
            amountPerReferral: ethers.parseEther('5'),
            amountPerSlip: ethers.parseEther('2'),
            endDate: now + (60 * 60 * 4)
        };
        const refManager = await ReferralManager.deploy(betnAdmin.address, refSettings);
        const minter = await betn.MINTER_ROLE();
        await betn.grantRole(minter, refManager.target);
        return {
            slipSettings,
            refSettings,
            refManager,
            slips,
            manager,
            dao,
            teams,
            teamsOwner,
            betn,
            betnAdmin,
            chelsea,
            manUnited,
            game,
            gameId,
            bet,
            bet2,
            slipNftId,
            slipNftId2,
            user,
            user2,
            ref,
            lp,
            lpSettings,
            communityNft,
            liquidityBookie
        };

    }



    describe("Deployment", function () {
        it("BetManager and SlipsManager Should set the right team nft contract", async function () {
            const { manager, teams, slips, slipSettings, } = await loadFixture(deployBetManager);
            expect(await manager.teamsNft()).to.equal(teams.target);
            const settings = await slips.settings();
            expect(settings.fee).to.equal(slipSettings.fee);
            expect(settings.teamFee).to.equal(slipSettings.teamFee);
            expect(settings.betsManager).to.equal(manager.target);
        });

        it("BetManager Should update slips settings", async function () {
            const { slips, dao, lp, communityNft } = await loadFixture(deployBetManager);
            const [teamsOwner, managerOwner] = await ethers.getSigners();
            const Mngr = await ethers.getContractFactory("BetManager");
            const BetNfts = await ethers.getContractFactory("BetnNfts");
            const teams = await BetNfts.deploy(teamsOwner.address, lp.target, ethers.parseEther('5'));
            const manager = await Mngr.deploy(managerOwner.address, teams.target, dao.target);
            const feeInfo = {
                communityNft: communityNft.target,
                teamsNft: teams.target,
                betsManager: manager.target,
                fee: ethers.parseUnits('25', 3),
                teamFee: 5000n, // 5% // paid to owner of winning team NFT
                bookieFee: 5000n, // 5% // paid to the game bookie
                betFee: 5000n, // 5% // paid to owner of the winning bet;
                marketFee: 5000n, // 5% // paid to owner of the winning market
                liquidityFee: 5000n// 10
            };
            await expect(slips.updateSettings(feeInfo)).not.to.be.reverted;
            const settings = await slips.settings();
            expect(settings.fee).to.equal(feeInfo.fee);
            expect(settings.liquidityFee).to.equal(feeInfo.liquidityFee);
        });

        it("BetManager Should update manager settings", async function () {
            const { manager, betnAdmin, lp, betn } = await loadFixture(deployBetManager);
            const [teamsOwner] = await ethers.getSigners();
            const BetNfts = await ethers.getContractFactory("BetnNfts");
            const teams = await BetNfts.deploy(teamsOwner.address, lp.target, ethers.parseEther('5'));
            const BetnPOSDAO = await ethers.getContractFactory("BetnPOSDAO");
            const dao = await BetnPOSDAO.deploy(betnAdmin.address, betn.target);
            await expect(manager.update(teams.target, dao.target)).not.to.be.reverted;
            expect(await manager.teamsNft()).to.equal(teams.target);
        });




    });

    describe("Admin Setup", function () {

        it("BetManager Should set store bets", async function () {
            const { manager } = await loadFixture(setupFixure);
            const bet = await manager.getBet(betsjson[3].betId);
            expect(bet.boolOutcome).to.be.equal(betsjson[3].boolOutcome);
            expect(bet.mode).to.be.equal(betsjson[3].mode);
            expect(bet.team).to.equal(betsjson[3].team);
        });

        it("BetManager Should set store markets", async function () {
            const { manager } = await loadFixture(setupFixure);
            const mkt = markets[3];
            await deployMarket(mkt.marketId, manager);
            expect(await manager.validMarket(mkt.bets[1])).to.be.equal(mkt.marketId);
        });

        it("teams Should batch mint", async function () {
            const { teams } = await loadFixture(setupFixure);
            const [, , , user] = await ethers.getSigners();
            await expect(teams.mintMany(user.address, teamsJson.slice(0, 5))).not.to.be.reverted;
            expect(await teams.balanceOf(user)).to.be.eq(5);
        });
    });


    describe("Games", function () {
        it("BetManager should createGame(...)", async function () {
            const { manager, game, gameId } = await loadFixture(gameFixture);
            const saved = await manager.getGame(gameId);
            expect(saved.homeTeam).to.be.eq(game.homeTeam);
            expect(saved.startTime).to.be.eq(game.startTime);
            expect(saved.endTime).to.be.eq(game.endTime);
            expect(saved.players[2]).to.be.eq(game.players[2]);
        });

        it("BetManager should setScores(...) for match", async function () {
            const { manager, game, gameId } = await loadFixture(gameFixture);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: false,
                homeScore: 3,
                awayScore: 2,
                homeHalftimeScore: 2,
                awayHalftimeScore: 0,
            };
            await time.increaseTo(game.endTime + 10 * 60);
            await manager.setScores(gameResult);
            const saved = await manager.getResuls(gameId);
            expect(saved.homeScore).to.be.eq(gameResult.homeScore);
            expect(saved.awayHalftimeScore).to.be.eq(gameResult.awayHalftimeScore);
            expect(saved.halftimeResult).to.be.eq(Results.HOME);
            expect(saved.result).to.be.eq(Results.HOME);
            expect(saved.secondHalfResult).to.be.eq(Results.AWAY);
        });

        it("BetManager should setScores(...) for competition", async function () {
            const { manager, game, gameId, chelsea, manUnited } = await loadFixture(gameFixture);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                gold: chelsea,
                silver: manUnited,
                bronze: 4,
            };
            await time.increaseTo(game.endTime + 10 * 60);
            await manager.setScores(gameResult);
            const saved = await manager.getResuls(gameId);
            expect(saved.gold).to.be.eq(chelsea);
            expect(saved.silver).to.be.eq(manUnited);
            expect(saved.bronze).to.be.eq(4);
        });

        it("BetManager should setScores(...) for cancellation", async function () {
            const { manager, game, gameId } = await loadFixture(gameFixture);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: true,
            };
            await time.increaseTo(game.endTime + 10 * 60);
            await manager.setScores(gameResult);
            const saved = await manager.getResuls(gameId);
            expect(saved.result).to.be.eq(Results.CANCELLED);
        });
    });

    describe("Bets", function () {
        it("it should NOT placeBet(...) if game was cancelled", async function () {
            const { manager, gameId, slips } = await loadFixture(gameFixture);
            const [, , , user, ref] = await ethers.getSigners();
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: true,
            };
            await manager.setScores(gameResult);
            const fullTimeHome = '0x247fd94705a7726a87669109aabd5f9559eead3ec732930f4c2fd0b3d0b5e4c8';
            const bnbMarketId = '0x833aea91e37d4070293778c9e8c234220b2128a9fca79730f85ff4115f20ea88';
            const bet = {
                amount: ethers.parseEther('0.01'),
                paid: 0,
                betid: fullTimeHome,
                marketId: bnbMarketId,
                gameid: gameId,
                currency: ethers.ZeroAddress,
                ref: ref.address,
                uuid: uuidBigInt()
            };
            await expect(slips.placeBet(user.address, bet, { value: bet.amount }))
                .to.be.revertedWithCustomError(slips, 'GameWasCancelled');
        });

        it("it should NOT placeBet(...) if game started", async function () {
            const { slips, game, gameId } = await loadFixture(gameFixture);
            const [, , , user, ref] = await ethers.getSigners();
            const fullTimeHome = '0x247fd94705a7726a87669109aabd5f9559eead3ec732930f4c2fd0b3d0b5e4c8';
            const bnbMarketId = '0x833aea91e37d4070293778c9e8c234220b2128a9fca79730f85ff4115f20ea88';
            const bet = {
                amount: ethers.parseEther('0.01'),
                paid: 0,
                betid: fullTimeHome,
                marketId: bnbMarketId,
                gameid: gameId,
                currency: ethers.ZeroAddress,
                ref: ref.address,
                uuid: uuidBigInt()
            };
            await time.increaseTo(game.startTime + 2);
            await expect(slips.placeBet(user.address, bet, { value: bet.amount }))
                .to.be.revertedWithCustomError(slips, 'GameAlreadyStarted');
        });

        it("it should placeBet(...)", async function () {
            const { slips, bet, slipNftId } = await loadFixture(betFixture);
            const userBet = await slips.getSlip(slipNftId);
            expect(userBet.amount).to.be.eq(bet.amount);
            expect(userBet.betid).to.be.eq(bet.betid);
        });


        it("it should withdraw cancelledBet(...) before game starts", async function () {
            const { slips, bet, slipNftId, user } = await loadFixture(betFixture);
            expect(await slips.connect(user).cancelledBet(slipNftId, user.address))
                .to.changeEtherBalance(user, bet.amount);
            const userBet = await slips.getSlip(slipNftId);
            expect(userBet.amount).to.be.eq(0);

        });

        it("it should NOT withdraw cancelledBet(...) after game starts", async function () {
            const { slips, slipNftId, user, game, } = await loadFixture(betFixture);
            time.increaseTo(game.startTime + 10);
            await expect(slips.connect(user).cancelledBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(slips, 'GameWasNotCancelled');
        });

        it("it should withdraw cancelledBet(...) if game is cancelled", async function () {
            const { manager, slips, bet, slipNftId, user, game, gameId } = await loadFixture(betFixture);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: true,
            };
            await time.increaseTo(game.endTime + 10 * 60);
            await manager.setScores(gameResult);
            expect(await slips.connect(user).cancelledBet(slipNftId, user.address)).to.changeEtherBalance(user, bet.amount);
            const userBet = await slips.getSlip(slipNftId);
            expect(userBet.paid).to.be.eq(bet.amount);
        });

    });

    describe("Claim Bets", function () {
        it("it should NOT claimBet(...) if game was cancelled", async function () {
            const { manager, slips, slipNftId, game, user, gameId } = await loadFixture(betFixture);
            await time.increaseTo(game.endTime + 2);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: true,
            };
            await manager.setScores(gameResult);
            await expect(slips.connect(user).claimBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(slips, 'GameWasCancelled');
        });

        it("it should NOT claimBet(...) if game results are pending", async function () {
            const { slips, slipNftId, game, user } = await loadFixture(betFixture);
            await time.increaseTo(game.endTime + 2);
            await expect(slips.connect(user).claimBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(slips, 'GameResultsArePending');
        });

        it("it should NOT claimBet(...) if user didnot bet", async function () {
            const { manager, slips, slipNftId, game, gameId } = await loadFixture(betFixture);
            await time.increaseTo(game.endTime + 2);
            const [, , , , , , user] = await ethers.getSigners();
            const gameResult = {
                ...defaultGameResult,
                gameId,
                homeScore: 4,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };
            await manager.setScores(gameResult);
            await expect(slips.connect(user).claimBet(slipNftId, user.address,))
                .to.be.revertedWithCustomError(slips, 'NotYourBet');
        });

        it("it should NOT claimBet(...) if BET was lost", async function () {
            const { manager, slips, slipNftId, game, gameId, user } = await loadFixture(betFixture);
            await time.increaseTo(game.endTime + 2);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                homeScore: 1,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };
            await manager.setScores(gameResult);
            await expect(slips.connect(user).claimBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(slips, 'BetDidNotWin');

        });

        it("it should Not claimBet(...) if BET was not backed", async function () {
            const { manager, slips, slipNftId, game, gameId, user } = await loadFixture(unbackedBetFixture);
            await time.increaseTo(game.endTime + 2);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                homeScore: 4,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };
            await manager.setScores(gameResult);
            await expect(slips.connect(user).claimBet(slipNftId, user.address,))
                .to.be.revertedWithCustomError(slips, 'BetPoolWasNotBacked');

        });
    });

    describe("Bets testcases", function () {
        const testCase = cases[0];
        it(`Should allow nftowners to withdraw fees on ${testCase.test}`, async function () {
            const { slips, manager, game, gameId, bookie, manUnitedOwner, betsOWner, marketsOwner, communityNft } = await loadFixture(gameFixture);
            for (const bet of betsjson) {
                await communityNft.safeMint(betsOWner.address, BigInt(bet.betId));
            }
            for (const market of markets) {
                await communityNft.safeMint(marketsOwner.address, BigInt(market.marketId));
            }
            const betsList = [];
            const accounts = await ethers.getSigners();
            let i = 20;
            for (const betCase of testCase.bets) {
                const user = accounts[i];
                i++;
                const bet = {
                    amount: ethers.parseEther('0.3'),
                    paid: 0,
                    betid: betCase.betId,
                    marketId: testCase.marketId,
                    gameid: gameId,
                    currency: ethers.ZeroAddress,
                    ref: ethers.ZeroAddress,
                    uuid: uuidBigInt()
                };
                await slips.placeBet(user.address, bet, { value: bet.amount });
                const nftId = bet.uuid;
                betsList.push({
                    ...betCase,
                    user,
                    nftId
                });
            }
            await time.increaseTo(game.endTime + 2);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                homeScore: 2,
                awayScore: 1,
                homeHalftimeScore: 1,
                awayHalftimeScore: 0,
            };
            await manager.setScores(gameResult);
            const totalBackedBets = ethers.parseEther('0.3') * BigInt(testCase.bets.length - 1);
            const expectedWinnings = (totalBackedBets * 70n) / 100n;
            const expectedAdminWinnings = (totalBackedBets * 10n) / 100n;
            const othersWinnings = (totalBackedBets * 5n) / 100n;
            let hasTruth = false;
            const [, , , , , , , , , reciever] = await ethers.getSigners();

            for (const betItem of betsList) {
                // claim winings
                const won = await manager.won(betItem.betId, gameId);
                if (won && !betItem.result) {
                    console.log(`${testCase.test} no match: ${betItem.result}`);
                }
                if (betItem.result) {
                    hasTruth = true;

                    await expect(slips.connect(betItem.user).claimBet(betItem.nftId, betItem.user.address)).to.changeEtherBalance(betItem.user, expectedWinnings + ethers.parseEther('0.3'));
                    // slipadmin
                    const poolKey = {
                        betid: betItem.betId,
                        marketId: testCase.marketId,
                        gameid: gameId,
                        currency: ethers.ZeroAddress,
                    };
                    const collectFees2 = 'collectFees((bytes32,bytes32,uint256,address)[],address)';
                    const collectFees = 'collectFees((bytes32,bytes32,uint256,address),address)';
                    await expect(slips[collectFees](poolKey, reciever.address))
                        .to
                        .changeEtherBalance(reciever, expectedAdminWinnings);
                    // bookie
                    await expect(slips.connect(bookie)[collectFees2]([poolKey], bookie.address))
                        .to
                        .changeEtherBalance(bookie, othersWinnings);
                    // teamNft owner
                    await expect(slips.connect(manUnitedOwner)[collectFees](poolKey, manUnitedOwner.address))
                        .to
                        .changeEtherBalance(manUnitedOwner, othersWinnings);
                    // market owner
                    await expect(slips.connect(marketsOwner)[collectFees2]([poolKey], marketsOwner.address))
                        .to
                        .changeEtherBalance(marketsOwner, othersWinnings);
                    // betOwner
                    await expect(slips.connect(betsOWner)[collectFees](poolKey, betsOWner.address))
                        .to
                        .changeEtherBalance(betsOWner, othersWinnings);
                    console.log(`Collectected fees for ${testCase.test} ${betItem.betId}`);
                } else {
                    await expect(slips.connect(betItem.user).claimBet(betItem.nftId, betItem.user.address)).to.be.revertedWithCustomError(slips, 'BetDidNotWin');
                }
            }
            if (!hasTruth) {
                console.log(`${testCase.test} has no truth ${testCase.marketId}`);
            }
        });
    });

    describe("Bets testcases", function () {

        // eslint-disable-next-line no-unreachable-loop
        for (const testCase of cases) {
            it(`is should verify ${testCase.test}`, async function () {
                const { slips, manager, game, gameId } = await loadFixture(gameFixture);
                const betsList = [];
                const accounts = await ethers.getSigners();
                let i = 20;
                for (const betCase of testCase.bets) {
                    const user = accounts[i];
                    i++;
                    const bet = {
                        amount: ethers.parseEther('0.3'),
                        paid: 0,
                        betid: betCase.betId,
                        marketId: testCase.marketId,
                        gameid: gameId,
                        currency: ethers.ZeroAddress,
                        ref: ethers.ZeroAddress,
                        uuid: uuidBigInt()
                    };
                    await slips.placeBet(user.address, bet, { value: bet.amount });
                    const nftId = bet.uuid;
                    betsList.push({
                        ...betCase,
                        user,
                        nftId
                    });
                }
                await time.increaseTo(game.endTime + 2);
                const gameResult = {
                    ...defaultGameResult,
                    gameId,
                    homeScore: 2,
                    awayScore: 1,
                    homeHalftimeScore: 1,
                    awayHalftimeScore: 0,
                };
                await manager.setScores(gameResult);
                const totalBackedBets = ethers.parseEther('0.3') * BigInt(testCase.bets.length - 1);
                const expectedWinnings = (totalBackedBets * 70n) / 100n;
                let hasTruth = false;
                for (const betItem of betsList) {
                    // claim winings
                    const won = await manager.won(betItem.betId, gameId);
                    if (won && !betItem.result) {
                        console.log(`${testCase.test} no match: ${betItem.result}`);
                    }
                    if (betItem.result) {
                        hasTruth = true;
                        // console.log(`${testCase.test} Database won: ${betItem.betId}`);
                        await expect(slips.connect(betItem.user).claimBet(betItem.nftId, betItem.user.address)).to.changeEtherBalance(betItem.user, expectedWinnings + ethers.parseEther('0.3'));
                    } else {
                        await expect(slips.connect(betItem.user).claimBet(betItem.nftId, betItem.user.address)).to.be.revertedWithCustomError(slips, 'BetDidNotWin');
                    }
                }
                if (!hasTruth) {
                    console.log(`${testCase.test} has no truth ${testCase.marketId}`);
                }
            });
        }
    });





    describe("BetnPOSDAO tests", function () {
        it("it should deploy posdao", async function () {
            const { dao, manager, betn } = await loadFixture(deployPosDaoFixture);
            const settings = await dao.settings();
            expect(await settings.minVotes).to.be.eq(12);
            expect(await settings.maxRewardPerValidator).to.be.eq(ethers.parseEther('60'));
            expect(await settings.maxTotalRewardPerGame).to.be.eq(ethers.parseEther('500'));
            expect(await settings.betn).to.be.eq(betn.target);
            expect(await settings.betManager).to.be.eq(manager.target);
        });

        it("it should admin update posdao", async function () {
            const { dao } = await loadFixture(deployPosDaoFixture);
            const { betn } = await deployBetnFixture();
            const { manager } = await deployBetManager();
            const config = {
                maxRewardPerValidator: ethers.parseEther('50'),
                maxTotalRewardPerGame: ethers.parseEther('300'),
                minVotes: 10,
                betn: betn.target,
                betManager: manager.target
            };
            await dao.updateSettings(config);
            let totalReward = 0;
            let i = 0;
            for (i = 0; i < 100; i++) {
                const reward1 = await dao.resultReward(i);
                const reward = parseFloat(ethers.formatEther(reward1));
                if (reward < 1) break;
                totalReward += reward;
                console.log(
                    i + 1,
                    '=>',
                    reward.toFixed(2),

                    '\n'
                );

            }
            console.log(
                totalReward.toFixed(2),
                i
            );
            const settings = await dao.settings();
            expect(await settings.minVotes).to.be.eq(config.minVotes);
            expect(await settings.maxRewardPerValidator).to.be.eq(config.maxRewardPerValidator);
            expect(await settings.maxTotalRewardPerGame).to.be.eq(config.maxTotalRewardPerGame);
            expect(await settings.betn).to.be.eq(config.betn);
            expect(await settings.betManager).to.be.eq(config.betManager);
        });


        it("it should submit game results and vote", async function () {
            const { dao, betn, gameId, bookie, game } = await loadFixture(deployPosDaoGameFixture);
            const fullGame = {
                ...defaultGameResult,
                gameId,
                homeScore: 1,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };
            const coder = ethers.AbiCoder.defaultAbiCoder();
            const gameHash = ethers.keccak256(coder.encode(
                ["tuple(uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)"],
                [Object.values(fullGame)]
            ));


            // make bookie validator
            const validator = await dao.VALIDATOR_ROLE();
            await dao.grantRole(validator, bookie.address);
            // approve stake;
            const threeK = ethers.parseEther('500');
            await betn.transfer(bookie.address, threeK);
            await betn.approve(dao.target, threeK);
            await betn.connect(bookie).approve(dao.target, threeK);
            // before game ends
            await expect(dao.submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'GameNotEnded');
            await time.increaseTo(game.endTime + 10);
            await expect(dao.submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'BookieGracePeriodStillActive');
            await expect(dao.connect(bookie).submitGameResults(fullGame)).not.to.be.reverted;
            expect(await dao.resultVotes(gameHash)).to.be.eq(1);
            const [topDraw, topHash, totalVotes, topVote, stake] = await dao.topInfo(gameId);
            expect(topDraw).to.be.eq(false);
            expect(topHash).to.be.eq(gameHash);
            expect(totalVotes).to.be.eq(1);
            expect(topVote).to.be.eq(1);
            expect(stake).to.be.eq(ethers.parseEther('60'));
            await expect(dao.connect(bookie).submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'AlreadyVoted');
            await time.increaseTo(game.endTime + (11 * 60));// after ten minutes
            await expect(dao.submitGameResults(fullGame)).not.to.be.reverted;
            const [, , totalVote, ,] = await dao.topInfo(gameId);
            expect(totalVote).to.be.eq(2);
        });

        it("it should claim rewards for game results after votes", async function () {
            const { betn, dao, manager, gameId, bookie, game } = await loadFixture(deployPosDaoGameFixture);
            const admin = await manager.DEFAULT_ADMIN_ROLE();
            await manager.grantRole(admin, dao.target);
            const fullGame = {
                ...defaultGameResult,
                gameId,
                homeScore: 1,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };

            const fullGame2 = {
                ...fullGame,
                homeScore: 3,
            };
            const coder = ethers.AbiCoder.defaultAbiCoder();
            const gameHash = ethers.keccak256(coder.encode(
                ["tuple(uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)"],
                [Object.values(fullGame)]
            ));
            const [, , , , , , , , , one, two, three, four, five, six] = await ethers.getSigners();
            // reduce minVote
            const [
                maxRewardPerValidator,
                maxTotalRewardPerGame,
                ,
                betnContract,
                betManager
            ] = await dao.settings();
            await dao.updateSettings({
                maxRewardPerValidator,
                maxTotalRewardPerGame,
                minVotes: 5,
                betn: betnContract,
                betManager
            });
            // make them validators
            const validator = await dao.VALIDATOR_ROLE();
            await dao.grantRole(validator, bookie.address);
            await dao.grantRole(validator, one.address);
            await dao.grantRole(validator, two.address);
            await dao.grantRole(validator, three.address);
            await dao.grantRole(validator, four.address);
            await dao.grantRole(validator, five.address);
            await dao.grantRole(validator, six.address);
            // approve stake;
            const threek = ethers.parseEther('3000');
            await betn.approve(dao.target, threek);
            // topups
            await betn.transfer(bookie.address, threek);
            await betn.transfer(one.address, threek);
            await betn.transfer(two.address, threek);
            await betn.transfer(three.address, threek);
            await betn.transfer(four.address, threek);
            await betn.transfer(five.address, threek);
            await betn.transfer(six.address, threek);
            await betn.connect(bookie).approve(dao.target, threek);
            await betn.connect(one).approve(dao.target, threek);
            await betn.connect(two).approve(dao.target, threek);
            await betn.connect(three).approve(dao.target, threek);
            await betn.connect(four).approve(dao.target, threek);
            await betn.connect(five).approve(dao.target, threek);
            await betn.connect(six).approve(dao.target, threek);
            // end the game
            await time.increaseTo(game.endTime + 10);
            // bookie
            await dao.connect(bookie).submitGameResults(fullGame);
            await dao.connect(one).submitGameResults(fullGame);
            await dao.connect(two).submitGameResults(fullGame);
            await expect(dao.connect(bookie).claimReward(gameId, bookie.address)).to.be.revertedWithCustomError(dao, 'NoConsensus');
            await dao.connect(three).submitGameResults(fullGame);
            await dao.connect(four).submitGameResults(fullGame);
            await dao.connect(five).submitGameResults(fullGame);
            await dao.connect(six).submitGameResults(fullGame2); // should lose stake
            const [topDraw, topHash, totalVotes, topVote,] = await dao.topInfo(gameId);
            expect(topDraw).to.be.eq(false);
            expect(topHash).to.be.eq(gameHash);
            expect(totalVotes).to.be.eq(7);
            expect(topVote).to.be.eq(6);
            // 
            const bookieReward = await dao.claimableReward(gameId, bookie.address);
            await expect(dao.connect(bookie).claimReward(gameId, bookie.address)).to.changeTokenBalance(betn, bookie, bookieReward);
            const fourReward = await dao.claimableReward(gameId, four.address);
            await expect(dao.connect(four).claimReward(gameId, four.address)).to.changeTokenBalance(betn, four, fourReward);
            await expect(dao.connect(six).claimReward(gameId, six.address)).to.be.revertedWithCustomError(dao, 'StakeWasLost');
            await expect(dao.connect(bookie).claimReward(gameId, bookie.address)).to.be.revertedWithCustomError(dao, 'AlreadyClaimed');
            // should update game manager;
            const results = await manager.getResuls(gameId);
            expect(results.awayScore).to.be.eq(fullGame.awayScore);
            expect(results.homeHalftimeScore).to.be.eq(fullGame.homeHalftimeScore);
        });

        // test acquireValidatorRole in contract ../contracts/BetnPOSDAO.sol;
        it("it should acquireValidatorRole", async function () {
            const [, , , , , , , , , user] = await ethers.getSigners();
            const { dao, betn } = await loadFixture(deployPosDaoFixture);
            const tenk = ethers.parseEther('10000');
            await betn.transfer(user.address, tenk);
            await betn.connect(user).approve(dao.target, tenk);
            await expect(dao.connect(user).acquireValidatorRole()).not.to.be.reverted;
            expect(await dao.hasRole(await dao.VALIDATOR_ROLE(), user.address)).to.be.eq(true);
        });

        // test acquireValidatorRole in contract ../contracts/BetnPOSDAO.sol;
        it("it should NOT acquireValidatorRole after 10 validators", async function () {
            const [, , , , , , , , , ...all] = await ethers.getSigners();
            const { dao, betn } = await loadFixture(deployPosDaoFixture);
            for (let i = 0; i < 10; i++) {
                const one = all[i];
                const tenk = ethers.parseEther('10000');
                await betn.transfer(one.address, tenk);
                await betn.connect(one).approve(dao.target, tenk);
                await expect(dao.connect(one).acquireValidatorRole()).not.to.be.reverted;
                expect(await dao.hasRole(await dao.VALIDATOR_ROLE(), one.address)).to.be.eq(true);
            }
            const eleven = all[10];
            const tenk = ethers.parseEther('10000');
            await betn.transfer(eleven.address, tenk);
            await betn.connect(eleven).approve(dao.target, tenk);
            await expect(dao.connect(eleven).acquireValidatorRole()).to.be.revertedWithCustomError(dao, 'MaxQValidatorsReached');
        });

        // test renounceValidatorRole in contract ../contracts/BetnPOSDAO.sol;
        it("it should renounceValidatorRole", async function () {
            const [, , , , , , , , , user] = await ethers.getSigners();
            const { dao, betn } = await loadFixture(deployPosDaoFixture);
            const tenk = ethers.parseEther('10000');
            await betn.transfer(user.address, tenk);
            await betn.connect(user).approve(dao.target, tenk);
            await dao.connect(user).acquireValidatorRole();
            await expect(dao.connect(user).renounceValidatorRole()).not.to.be.reverted;
            expect(await dao.hasRole(await dao.VALIDATOR_ROLE(), user.address)).to.be.eq(false);
        });


        // test delegateRole in contract ../contracts/BetnPOSDAO.sol;
        it("it should delegateRole", async function () {
            const [, , , , , , , , , user, delegate, delegate2] = await ethers.getSigners();
            const { dao, betn } = await loadFixture(deployPosDaoFixture);
            const tenk = ethers.parseEther('11000');
            await betn.transfer(user.address, tenk);
            await betn.connect(user).approve(dao.target, tenk); //  needs 10000 betn;
            await dao.connect(user).acquireValidatorRole();
            await expect(dao.connect(user).delegateRole(delegate.address)).not.to.be.reverted; // required 100 betn; approved above
            await expect(dao.connect(user).delegateRole(delegate2.address)).not.to.be.reverted; // required 100 betn; approved above
            expect(await dao.isValidator(user.address)).to.be.eq(true);
            expect(await dao.isValidator(delegate.address)).to.be.eq(true);
            expect(await dao.isValidator(delegate2.address)).to.be.eq(true);
            // renounce 2nd delegate
            await dao.connect(user).revokeDelegateRole(delegate2.address);
            expect(await dao.isValidator(delegate.address)).to.be.eq(true);
            expect(await dao.isValidator(delegate2.address)).to.be.eq(false);
            expect(await dao.hasRole(await dao.VALIDATOR_ROLE(), delegate.address)).to.be.eq(false);
            const list = dao.delegatedTo(user.address);
            console.log(list);
            const allValidators = await dao.quickValidators();
            console.log(allValidators);
        });

        /**
         * 
         */
        it("it should submit game results and vote as delegate", async function () {
            const { dao, betn, gameId, bookie, game } = await loadFixture(deployPosDaoGameFixture);
            const fullGame = {
                ...defaultGameResult,
                gameId,
                homeScore: 1,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };
            const coder = ethers.AbiCoder.defaultAbiCoder();
            const gameHash = ethers.keccak256(coder.encode(
                ["tuple(uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)"],
                [Object.values(fullGame)]
            ));

            // make bookie validator
            const validator = await dao.VALIDATOR_ROLE();
            await dao.grantRole(validator, bookie.address);
            // approve stake;
            const threeK = ethers.parseEther('3000');
            await betn.transfer(bookie.address, threeK);
            await betn.approve(dao.target, threeK);
            await betn.connect(bookie).approve(dao.target, threeK);
            const [, , , , , , , , , , , , , , , delegate] = await ethers.getSigners();
            await betn.transfer(delegate.address, threeK);
            await betn.connect(delegate).approve(dao.target, threeK);
            // delegate
            await dao.connect(bookie).delegateRole(delegate.address);
            // before game ends
            await expect(dao.submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'GameNotEnded');
            await time.increaseTo(game.endTime + 10);
            await expect(dao.submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'BookieGracePeriodStillActive');
            await expect(dao.connect(delegate).submitGameResults(fullGame)).not.to.be.reverted;
            expect(await dao.resultVotes(gameHash)).to.be.eq(1);
            const [topDraw, topHash, totalVotes, topVote, stake] = await dao.topInfo(gameId);
            expect(topDraw).to.be.eq(false);
            expect(topHash).to.be.eq(gameHash);
            expect(totalVotes).to.be.eq(1);
            expect(topVote).to.be.eq(1);
            expect(stake).to.be.eq(ethers.parseEther('60'));
            await expect(dao.connect(delegate).submitGameResults(fullGame)).to.be.revertedWithCustomError(dao, 'AlreadyVoted');
            await time.increaseTo(game.endTime + (11 * 60));// after ten minutes
            await expect(dao.submitGameResults(fullGame)).not.to.be.reverted;
            const [, , totalVote, ,] = await dao.topInfo(gameId);
            expect(totalVote).to.be.eq(2);
        });

        it("it should allow a delegate to claim rewards for game results after votes", async function () {
            const { betn, dao, manager, gameId, bookie, game } = await loadFixture(deployPosDaoGameFixture);
            const admin = await manager.DEFAULT_ADMIN_ROLE();
            await manager.grantRole(admin, dao.target);
            const fullGame = {
                ...defaultGameResult,
                gameId,
                homeScore: 1,
                awayScore: 2,
                homeHalftimeScore: 0,
                awayHalftimeScore: 1,
            };

            const fullGame2 = {
                ...fullGame,
                homeScore: 3,
            };
            const coder = ethers.AbiCoder.defaultAbiCoder();
            const gameHash = ethers.keccak256(coder.encode(
                ["tuple(uint256,uint256,uint256,uint256,bool,uint256,uint256,uint256,uint256)"],
                [Object.values(fullGame)]
            ));
            const [, , , , , , , , , one, two, three, four, five, six, delegate] = await ethers.getSigners();
            // reduce minVote
            const [
                maxRewardPerValidator,
                maxTotalRewardPerGame,
                ,
                betnContract,
                betManager
            ] = await dao.settings();
            await dao.updateSettings({
                maxRewardPerValidator,
                maxTotalRewardPerGame,
                minVotes: 5,
                betn: betnContract,
                betManager
            });
            // make them validators
            const validator = await dao.VALIDATOR_ROLE();
            await dao.grantRole(validator, bookie.address);
            await dao.grantRole(validator, one.address);
            await dao.grantRole(validator, two.address);
            await dao.grantRole(validator, three.address);
            await dao.grantRole(validator, four.address);
            await dao.grantRole(validator, five.address);
            await dao.grantRole(validator, six.address);
            // approve stake;
            const threek = ethers.parseEther('3000');
            await betn.approve(dao.target, threek);
            // topups
            await betn.transfer(bookie.address, threek);
            await betn.transfer(delegate.address, threek);
            await betn.transfer(one.address, threek);
            await betn.transfer(two.address, threek);
            await betn.transfer(three.address, threek);
            await betn.transfer(four.address, threek);
            await betn.transfer(five.address, threek);
            await betn.transfer(six.address, threek);
            await betn.connect(bookie).approve(dao.target, threek);
            await betn.connect(delegate).approve(dao.target, threek);
            await dao.connect(bookie).delegateRole(delegate.address);
            await betn.connect(one).approve(dao.target, threek);
            await betn.connect(two).approve(dao.target, threek);
            await betn.connect(three).approve(dao.target, threek);
            await betn.connect(four).approve(dao.target, threek);
            await betn.connect(five).approve(dao.target, threek);
            await betn.connect(six).approve(dao.target, threek);
            // end the game
            await time.increaseTo(game.endTime + 10);
            // bookie
            await dao.connect(delegate).submitGameResults(fullGame);
            // await dao.connect(bookie).submitGameResults(fullGame);
            await dao.connect(one).submitGameResults(fullGame);
            await dao.connect(two).submitGameResults(fullGame);
            await expect(dao.connect(delegate).claimReward(gameId, delegate.address)).to.be.revertedWithCustomError(dao, 'NoConsensus');
            await dao.connect(three).submitGameResults(fullGame);
            await dao.connect(four).submitGameResults(fullGame);
            await dao.connect(five).submitGameResults(fullGame);
            await dao.connect(six).submitGameResults(fullGame2); // should lose stake
            const [topDraw, topHash, totalVotes, topVote,] = await dao.topInfo(gameId);
            expect(topDraw).to.be.eq(false);
            expect(topHash).to.be.eq(gameHash);
            expect(totalVotes).to.be.eq(7);
            expect(topVote).to.be.eq(6);
            // 
            const bookieReward = await dao.claimableReward(gameId, delegate.address);
            await expect(dao.connect(delegate).claimReward(gameId, delegate.address)).to.changeTokenBalance(betn, delegate, bookieReward);
            const fourReward = await dao.claimableReward(gameId, four.address);
            await expect(dao.connect(four).claimReward(gameId, four.address)).to.changeTokenBalance(betn, four, fourReward);
            await expect(dao.connect(six).claimReward(gameId, six.address)).to.be.revertedWithCustomError(dao, 'StakeWasLost');
            await expect(dao.connect(delegate).claimReward(gameId, delegate.address)).to.be.revertedWithCustomError(dao, 'AlreadyClaimed');
            // should update game manager;
            const results = await manager.getResuls(gameId);
            expect(results.awayScore).to.be.eq(fullGame.awayScore);
            expect(results.homeHalftimeScore).to.be.eq(fullGame.homeHalftimeScore);
        });
    });

    describe("ReferralMananger Tests", function () {
        it('Should deploy refManager', async function () {
            const { refManager, refSettings } = await loadFixture(referralManagerFixture);
            const settings = await refManager.settings();
            expect(refSettings.amountPerReferral).to.be.eq(settings.amountPerReferral);
            expect(refSettings.betn).to.be.eq(settings.betn);
            expect(refSettings.endDate).to.be.eq(settings.endDate);
        });

        it('Should update refSettings', async function () {
            const { refManager, refSettings: setup } = await loadFixture(referralManagerFixture);
            const refSettings = {
                ...setup,
                amountPerReferral: ethers.parseEther('2'),
                amountPerSlip: ethers.parseEther('1'),
                endDate: setup.endDate + (60 * 60 * 4)

            };
            await refManager.updateSettings(refSettings);
            const settings = await refManager.settings();
            expect(refSettings.amountPerReferral).to.be.eq(settings.amountPerReferral);
            expect(refSettings.amountPerSlip).to.be.eq(settings.amountPerSlip);
            expect(refSettings.endDate).to.be.eq(settings.endDate);
        });

        it('Should Not claimRef if game has not ended or user is not ref', async function () {
            const { refManager, ref, slips, user, gameId, manager, slipNftId, slipNftId2 } = await loadFixture(referralManagerFixture);
            const [isClaimed,] = await refManager['isClaimed(uint256)'](slipNftId);
            expect(isClaimed).to.be.eq(false);
            await expect(slips.verifyUserOwnsAllSlips([slipNftId, slipNftId2], user.address)).to.be.revertedWithCustomError(slips, 'NotYourToken');
            await slips.verifyUserOwnsAllSlips([slipNftId], user.address);
            await expect(slips.verifyUserOwnsAllSlips([slipNftId], user.address)).not.to.be.reverted;
            await expect(slips.validateReferrals([slipNftId, slipNftId2], ref.address)).not.to.be.reverted;
            await expect(manager.verifyAllGamesHaveEnded([gameId])).to.be.revertedWithCustomError(manager, 'GameNotEnded');
            await expect(refManager.connect(user).claimRef(ref.address, [slipNftId, slipNftId2])).to.be.revertedWithCustomError(slips, 'NotYourReferral');
            await expect(refManager.connect(ref).claimRef(ref.address, [slipNftId, slipNftId2])).to.be.revertedWithCustomError(manager, 'GameNotEnded');
        });

        it('Should claim ref if game ended', async function () {
            const { refManager, ref, betn, game, refSettings, slipNftId, slipNftId2 } = await loadFixture(referralManagerFixture);
            await time.increaseTo(game.endTime + 60 * 60);
            await expect(refManager.connect(ref).claimRef(ref.address, [slipNftId, slipNftId2])).to.changeTokenBalance(betn, ref, refSettings.amountPerReferral * 2n);
        });

        it('Should Not claimReward if game has not ended or user didnot bet', async function () {
            const { refManager, slips, user, manager, slipNftId, slipNftId2 } = await loadFixture(referralManagerFixture);
            const [claimed,] = await refManager['ownerClaimed(uint256)'](slipNftId);
            expect(claimed).to.be.eq(false);
            await expect(refManager.connect(user).claimReward(user.address, [slipNftId2])).to.be.revertedWithCustomError(slips, 'NotYourToken');
            await expect(refManager.connect(user).claimReward(user.address, [slipNftId])).to.be.revertedWithCustomError(manager, 'GameNotEnded');
        });

        it('Should claim reward if game ended', async function () {
            const { refManager, user, betn, game, refSettings, slipNftId } = await loadFixture(referralManagerFixture);
            await time.increaseTo(game.endTime + 60 * 60);
            await expect(refManager.connect(user).claimReward(user.address, [slipNftId])).to.changeTokenBalance(betn, user, refSettings.amountPerSlip);
        });
    });

    describe("Liquidity Bookie", function () {
        it("it should NOT claimBet(...) if game was cancelled", async function () {
            const { manager, liquidityBookie, slipNftId, game, user, gameId } = await loadFixture(lpBookieBetFixture);
            await time.increaseTo(game.endTime + 2);
            const gameResult = {
                ...defaultGameResult,
                gameId,
                cancel: true,
            };
            await manager.setScores(gameResult);
            await expect(liquidityBookie.connect(user).claimBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(liquidityBookie, 'BetDidNotWin');
        });

        it("it should NOT claimBet(...) if game results are pending", async function () {
            const { liquidityBookie, slipNftId, game, user } = await loadFixture(lpBookieBetFixture);
            await time.increaseTo(game.endTime + 2);
            await expect(liquidityBookie.connect(user).claimBet(slipNftId, user.address))
                .to.be.revertedWithCustomError(liquidityBookie, 'BetDidNotWin');
        });
    });


    describe.only("Liquidity bookie testcases", function () {
        // eslint-disable-next-line no-unreachable-loop
        let i = 0;
        for (const testCase of cases) {
            i++;
            if (i > 2) break;
            it(`Liquidity bookie should verify ${testCase.test}`, async function () {
                const { liquidityBookie, betn, manager, game, gameId } = await loadFixture(gameFixture);
                const betsList = [];
                const accounts = await ethers.getSigners();
                let i = 20;
                const user2 = accounts[18];
                // get a random odd between 1 and 5 in bips
                await deployMarket(testCase.marketId, manager);
                for (const betCase of testCase.bets) {
                    const odd = (Math.floor(Math.random() * 5) + 1) * 100;
                    await liquidityBookie.setupGameOdds(gameId, [betCase.betId], [odd]);
                    const user = accounts[i];
                    const ref = accounts[i + 1];
                    const ref2 = accounts[i + 2];
                    i++;
                    const bet = {
                        amount: ethers.parseEther('0.3'),
                        paid: 0,
                        betids: [betCase.betId],
                        gameids: [gameId],
                        ref: ref.address,
                        isBetn: false,
                        uuid: uuidBigInt()
                    };
                    await liquidityBookie.placeBet(user.address, bet, { value: bet.amount });
                    const nftId = bet.uuid;
                    betsList.push({
                        ...betCase,
                        user,
                        nftId,
                        odd,
                        bet,
                        ref
                    });
                    // bet in betn
                    const bet2 = {
                        amount: ethers.parseEther('0.3'),
                        paid: 0,
                        betids: [betCase.betId, betCase.betId],
                        gameids: [gameId, gameId],
                        ref: ref.address,
                        isBetn: true,
                        uuid: uuidBigInt()
                    };
                    await betn.approve(liquidityBookie.target, bet2.amount);
                    await liquidityBookie.placeBet(user.address, bet2);
                    const nftId2 = bet2.uuid;
                    betsList.push({
                        ...betCase,
                        user,
                        nftId: nftId2,
                        odd,
                        bet: bet2,
                        ref: ref2
                    });
                }
                await time.increaseTo(game.endTime + 2);
                const gameResult = {
                    ...defaultGameResult,
                    gameId,
                    homeScore: 2,
                    awayScore: 1,
                    homeHalftimeScore: 1,
                    awayHalftimeScore: 0,
                };
                await manager.setScores(gameResult);

                let hasTruth = false;
                for (const { betId, result, user, nftId, bet, odd } of betsList) {
                    // claim winings
                    const betnTokens = bet.isBetn
                        ? bet.amount
                        : (bet.amount * ethers.parseEther('100')) / BigInt(1e18); // price
                    const expectedWinnings = (betnTokens * BigInt(odd)) / 10000n;
                    const won = await manager.won(betId, gameId);
                    if (won && !result) {
                        console.log(`${testCase.test} no match: ${result}`);
                    }
                    // test invalid claims should fail;
                    await expect(liquidityBookie.connect(user2).claimBet(nftId, user2.address,))
                        .to.be.revertedWithCustomError(liquidityBookie, 'NotYourBet');
                    await expect(liquidityBookie.connect(user2).claimReferral(user2.address,))
                        .to.be.revertedWithCustomError(liquidityBookie, 'InvalidInput');
                    if (result) {
                        hasTruth = true;
                        // console.log(`${testCase.test} Database won: ${betItem.betId}`);
                        await expect(liquidityBookie.connect(user).claimBet(nftId, user.address)).to.changeTokenBalance(betn, user, expectedWinnings);
                        // should claim ref
                    } else {
                        await expect(liquidityBookie.connect(user).claimBet(nftId, user.address)).to.be.revertedWithCustomError(liquidityBookie, 'BetDidNotWin');
                    }
                }
                if (!hasTruth) {
                    console.log(`${testCase.test} has no truth ${testCase.marketId}`);
                }
            });

        }
    });
});
