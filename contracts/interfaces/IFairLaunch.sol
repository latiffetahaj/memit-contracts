// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./INonfungiblePositionManager.sol";
import "./IWETH.sol";
import "./IERC20Minimal.sol";
import "../library/UniswapV3PricingHelper.sol";

interface IFairLaunch {
    error LiquidtyIsNotYetAdded();
    error FairLaunchIsStillLive();
    error FairLaunchHasEnded();
    error ClaimDateIsPending();
    error AlreadyClaimed();
    struct Setting {
        bool lpAdded;
        address sleepfinance;
        address team;
        IERC20Minimal token;
        IWETH9 weth;
        INonfungiblePositionManager uniswap;
        uint256 endTime;
    }
    struct Tokenomics {
        uint256 membersAllocation; //50
        uint256 liquidityAllocation; // 40
        uint256 teamAllocation; //10
        uint256 totalContribution;
    }
    event Contribution(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);

    function initialize(Setting calldata config) external;

    function tokenomics() external view returns (Tokenomics memory);

    function settings() external view returns (Setting memory);

    function contribute() external payable;

    function claim() external;

    function teamClaim() external;

    /**
     * Add Liquiduity after sale date ends
     */
    function addLiquidity() external;

    /**
     * project dev can collect fees
     */
    function collectAllFees() external;

    /**
     * project dev remove any ERC20Tokens Sent here after Launch
     */
    function removeTokens(IERC20Minimal token) external;
}
