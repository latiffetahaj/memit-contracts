// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// BondingMath.sol
import "./libraries/BondingMath.sol";
import "./libraries/UniswapPoolCreator.sol";
import "./interfaces/IBondingCurve.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/ILock.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IToken is IERC20 {
    function TOTAL_SUPPLY() external returns (uint256);
}

// BondingCurve.sol
contract BondingCurve is
    IBondingCurve,
    Initializable,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721Receiver
{
    using BondingMath for uint256;
    using UniswapPoolCreator for *;
    using Address for address payable;
    using SafeERC20 for IERC20;
    using SafeERC20 for IToken;

    // Constants
    IFactory.BondingCurveSettings private settings;

    // State variables
    IToken public token;
    address public lockContract;
    address public uniswapPool;
    uint256 public lpTokenId;
    bool public isFinalized;

    enum Phase {
        PreBonding,
        Bonding,
        Finalized
    }

    Phase public currentPhase;

    uint256 public totalPreBondingContributions;
    uint256 public preBondingTokenPrice;
    uint256 public ethReserve;
    uint256 public tokenReserve;
    uint256 public totalETHCollected;
    uint256 public accumulatedFees;

    mapping(address => uint256) public contributions;
    mapping(address => bool) public tokenLocks;
    mapping(address => uint256) public tokenAllocations;

    modifier onlyPhase(Phase phase) {
        if (currentPhase != phase) revert InvalidPhase();
        _;
    }

    function initialize(
        address token_,
        address lock_,
        address owner_,
        IFactory.BondingCurveSettings calldata settings_
    ) external initializer {
        if (token_ == address(0) || lock_ == address(0) || owner_ == address(0))
            revert ZeroAddress();

        __Ownable_init(owner_);
        __ReentrancyGuard_init();

        token = IToken(token_);
        lockContract = lock_;
        settings = settings_;
        currentPhase = Phase.PreBonding;
        preBondingTokenPrice =
            (settings.virtualEth * 1e18) /
            token.TOTAL_SUPPLY();
    }

    function contributePreBonding()
        external
        payable
        nonReentrant
        onlyPhase(Phase.PreBonding)
    {
        if (msg.value < settings.minContribution) revert ContributionTooLow();

        uint256 newTotal = totalPreBondingContributions + msg.value;
        if (newTotal > settings.preBondingTarget)
            revert PreBondingTargetReached();

        contributions[msg.sender] += msg.value;
        totalPreBondingContributions = newTotal;

        uint256 tokenAmount = (msg.value * 1e18) / preBondingTokenPrice;
        tokenAllocations[msg.sender] += tokenAmount;
        tokenLocks[msg.sender] = true;

        emit PreBondingContribution(msg.sender, msg.value, tokenAmount);

        if (newTotal >= settings.preBondingTarget) {
            currentPhase = Phase.Bonding;
            ethReserve = settings.virtualEth + totalPreBondingContributions;
            tokenReserve = token.balanceOf(address(this));
            totalETHCollected = totalPreBondingContributions;
            emit PreBondingCompleted(settings.preBondingTarget, tokenReserve);
        }
    }

    function buyTokens(
        uint256 minTokens
    ) external payable nonReentrant onlyPhase(Phase.Bonding) {
        if (msg.value < settings.minContribution) revert ContributionTooLow();
        if (totalETHCollected > settings.bondingTarget)
            revert BondingTargetReached();

        uint256 tokensToReceive = BondingMath.calculateTokensForETH(
            ethReserve,
            tokenReserve,
            msg.value
        );

        if (tokensToReceive < minTokens) revert SlippageExceeded();
        if (tokenReserve < tokensToReceive) revert InsufficientTokens();

        ethReserve += msg.value;
        tokenReserve -= tokensToReceive;
        totalETHCollected += msg.value;
        token.safeTransfer(msg.sender, tokensToReceive);
        emit TokensPurchased(msg.sender, msg.value, tokensToReceive);
        if (totalETHCollected >= settings.bondingTarget) {
            currentPhase = Phase.Finalized;
        }
    }

    function sellTokens(
        uint256 tokenAmount,
        uint256 minETH
    ) external nonReentrant onlyPhase(Phase.Bonding) {
        if (tokenAmount == 0) revert InsufficientTokens();
        if (tokenLocks[msg.sender]) revert TokensLocked();
        (uint256 ethToReceive, uint256 fee) = BondingMath.calculateETHForTokens(
            ethReserve,
            tokenReserve,
            tokenAmount,
            true
        );
        if (ethToReceive < minETH) revert SlippageExceeded();
        uint256 availableETH = ethReserve - settings.virtualEth;
        if (availableETH < ethToReceive + fee) revert InsufficientETH();
        ethReserve -= (ethToReceive + fee);
        tokenReserve += tokenAmount;
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        payable(msg.sender).sendValue(ethToReceive);
        payable(settings.feeTo).sendValue(fee);
        emit TokensSold(msg.sender, tokenAmount, ethToReceive, fee);
    }

    function finalizeCurve() external nonReentrant onlyOwner {
        if (totalETHCollected < settings.bondingTarget)
            revert CannotFinalizeYet();
        if (isFinalized) revert AlreadyFinalized();

        UniswapPoolCreator.PoolParams memory poolParams = UniswapPoolCreator
            .PoolParams({
                factory: settings.uniswapV3Factory,
                token: address(token),
                weth: settings.weth,
                fee: settings.poolFee,
                ethReserve: ethReserve,
                tokenReserve: tokenReserve
            });

        address pool = UniswapPoolCreator.createAndInitializePool(poolParams);

        uint256 ethLiquidity = address(this).balance;
        uint256 tokenLiquidity = (ethLiquidity * tokenReserve) / ethReserve;

        token.safeIncreaseAllowance(settings.positionManager, tokenLiquidity);

        UniswapPoolCreator.PositionParams memory posParams = UniswapPoolCreator
            .PositionParams({
                positionManager: settings.positionManager,
                token: address(token),
                weth: address(this),
                fee: settings.poolFee,
                tickSpacing: 60,
                ethAmount: ethLiquidity,
                tokenAmount: tokenLiquidity
            });
        uint256 tokenId = UniswapPoolCreator.createLPPosition(posParams);
        // approve tokenId transfer
        ILock(lockContract).lockNFT(tokenId);
        uniswapPool = pool;
        lpTokenId = tokenId;
        isFinalized = true;
        currentPhase = Phase.Finalized;
        emit CurveFinalized(pool, tokenId);
    }

    receive() external payable {}

    /**
     * @notice Implements IERC721Receiver
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
