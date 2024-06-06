// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/INonfungiblePositionManager.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/IFairLaunch.sol";
import "./library/UniswapV3PricingHelper.sol";

contract Fairlaunch is
    Initializable,
    OwnableUpgradeable,
    ERC721Holder,
    IFairLaunch
{
    using Address for address payable;
    int24 private MIN_TICK;
    int24 private MAX_TICK;
    int24 private TICK_SPACING;
    uint256 public tokenId;
    address public pool;
    mapping(address => uint256) public contributions;
    mapping(address => uint256) public claims;
    mapping(address => uint256) public claimDate;
    bool public teamHasClaimedTokens;
    Setting _settings;
    Tokenomics _tokenomics;
    uint256 public count;

    constructor() {
        _disableInitializers();
    }

    function initialize(Setting calldata config) public initializer {
        // team will buy back ownership in order to claim fees
        __Ownable_init(config.sleepfinance);
        _settings = config;
        MIN_TICK = -887272;
        MAX_TICK = -MIN_TICK;
        TICK_SPACING = 60;
        uint256 tbal = _settings.token.balanceOf(address(this));
        _tokenomics.membersReward = Math.mulDiv(tbal, 500, 10000); //5%
        _tokenomics.membersAllocation = Math.mulDiv(tbal, 4500, 10000); //45%
        _tokenomics.liquidityAllocation = Math.mulDiv(tbal, 4000, 10000); //40%
        _tokenomics.teamAllocation = Math.mulDiv(tbal, 1000, 10000); //10%
        claimDate[_settings.team] = block.timestamp + 25 days; //25day lock
    }

    function tokenomics() external view returns (Tokenomics memory) {
        return _tokenomics;
    }

    function settings() external view returns (Setting memory) {
        return _settings;
    }

    function contribute() external payable {
        if (msg.value < 0) revert YourAmountIsZero();
        if (_settings.endTime < block.timestamp) revert FairLaunchHasEnded();
        if (contributions[_msgSender()] == 0) count++;
        contributions[_msgSender()] += msg.value;
        claimDate[_msgSender()] = block.timestamp + 10 days;
        count++;
        emit Contribution(_msgSender(), msg.value);
    }

    function claim() external {
        if (!_settings.lpAdded) revert LiquidtyIsNotYetAdded();
        if (claimDate[_msgSender()] > block.timestamp)
            revert ClaimDateIsPending();
        if (claims[_msgSender()] > 0) revert AlreadyClaimed();
        claims[_msgSender()] = Math.mulDiv(
            contributions[_msgSender()],
            _tokenomics.membersAllocation,
            _tokenomics.totalContribution
        );
        _settings.token.transfer(_msgSender(), claims[_msgSender()]);
    }

    function teamClaim() external {
        if (!_settings.lpAdded) revert LiquidtyIsNotYetAdded();
        if (claimDate[_settings.team] > block.timestamp)
            revert ClaimDateIsPending();
        if (teamHasClaimedTokens) revert AlreadyClaimed();
        teamHasClaimedTokens = true;
        _settings.token.transfer(_settings.team, _tokenomics.teamAllocation);
        _settings.token.transfer(
            _settings.sleepfinance,
            _tokenomics.membersReward
        );
    }

    /**
     * Add Liquiduity after sale date ends
     */
    function addLiquidity() external {
        if (_settings.endTime > block.timestamp) revert FairLaunchIsStillLive();
        uint256 total = address(this).balance;
        payable(_settings.team).sendValue(Math.mulDiv(total, 1000, 10000));
        payable(_settings.sleepfinance).sendValue(
            Math.mulDiv(total, 500, 10000)
        );
        _tokenomics.totalContribution = address(this).balance;
        _addLp();
    }

    function createPool(uint256 tokenAmt, uint256 baseAmt) internal {
        (
            address token0,
            address token1,
            uint160 initSQRTPrice
        ) = UniswapV3PricingHelper.getInitPrice(
                address(_settings.weth),
                address(_settings.token),
                tokenAmt,
                baseAmt
            );
        pool = _settings.uniswap.createAndInitializePoolIfNecessary(
            token0, // token0
            token1, // token1
            3000,
            initSQRTPrice
        );
    }

    function _addLp()
        internal
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        uint256 amount0ToAdd = _tokenomics.liquidityAllocation; // 40%
        uint256 balance = address(this).balance;
        _settings.weth.deposit{value: balance}();
        uint256 amount1ToAdd = _settings.weth.balanceOf(address(this));
        createPool(amount0ToAdd, amount1ToAdd);
        _settings.token.approve(address(_settings.uniswap), amount0ToAdd);
        _settings.weth.approve(address(_settings.uniswap), amount1ToAdd);
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager
            .MintParams({
                token0: address(_settings.token),
                token1: address(_settings.weth),
                fee: 3000,
                tickLower: (MIN_TICK / TICK_SPACING) * TICK_SPACING,
                tickUpper: (MAX_TICK / TICK_SPACING) * TICK_SPACING,
                amount0Desired: amount0ToAdd,
                amount1Desired: amount1ToAdd,
                amount0Min: 0, // slippage??
                amount1Min: 0, // slippage??
                recipient: address(this),
                deadline: block.timestamp
            });
        (tokenId, liquidity, amount0, amount1) = _settings.uniswap.mint(params);
        if (amount0 < amount0ToAdd) {
            _settings.token.approve(address(_settings.uniswap), 0);
        }
        if (amount1 < amount1ToAdd) {
            _settings.weth.approve(address(_settings.uniswap), 0);
        }
        _settings.lpAdded = true;
    }

    /**
     * project dev can collect fees
     */
    function collectAllFees() external {
        if (!_settings.lpAdded) revert LiquidtyIsNotYetAdded();
        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: owner(),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
        _settings.uniswap.collect(params);
    }

    /**
     * project dev remove any ERC20Tokens Sent here after Launch
     */
    function removeTokens(IERC20Minimal token) external {
        // some users are still claiming.
        if (_settings.endTime > block.timestamp - 30 days)
            revert LiquidtyIsNotYetAdded();
        uint256 tbal = token.balanceOf(address(this));
        if (tbal > 0) token.transfer(owner(), tbal);
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) payable(owner()).sendValue(ethBal);
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes memory
    ) public override returns (bytes4) {
        tokenId = _tokenId;
        return this.onERC721Received.selector;
    }
}
