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
import "hardhat/console.sol";
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
    enum Phase { PreBonding, Bonding, Finalized }
    Phase public currentPhase;
    uint256 public ethReserve;
    uint256 public tokenReserve;
    uint256 public totalETHCollected;
    uint256 public accumulatedFees;
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
        currentPhase = Phase.Bonding;
        // Initialize virtual reserves for immediate bonding
        ethReserve = settings.virtualEth;
        tokenReserve = token.balanceOf(address(this));
    }
    function getBondingCurveSettings()
        external
        view
        returns (IFactory.BondingCurveSettings memory)
    {
        return settings;
    }
    // PreBonding phase removed: bonding starts immediately with virtual reserves
    function buyTokens(
        uint256 minTokens
    )
        external
        payable
        nonReentrant
        onlyPhase(Phase.Bonding)
        returns (uint256 tokensToReceive)
    {
        if (msg.value < settings.minContribution) revert ContributionTooLow();
        if (totalETHCollected > settings.bondingTarget)
            revert BondingTargetReached();
        tokensToReceive = BondingMath.calculateTokensForETH(
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
            finalizeCurve();
        }
    }
    function sellTokens(
        uint256 tokenAmount,
        uint256 minETH
    )
        external
        nonReentrant
        onlyPhase(Phase.Bonding)
        returns (uint256 ethToReceive, uint256 fee)
    {
        if (tokenAmount == 0) revert InsufficientTokens();
        (ethToReceive, fee) = BondingMath.calculateETHForTokens(
            ethReserve,
            tokenReserve,
            tokenAmount,
            settings.sellFee
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
    function finalizeCurve() internal nonReentrant {
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
                weth: settings.weth,
                fee: settings.poolFee,
                ethAmount: ethLiquidity,
                tokenAmount: tokenLiquidity
            });
        uint256 tokenId = UniswapPoolCreator.createLPPosition(posParams);
        // Approve lock contract to transfer the NFT
        INonfungiblePositionManager(settings.positionManager).approve(
            lockContract,
            tokenId
        );
        ILock(lockContract).lockNFT(tokenId, owner());
        uniswapPool = pool;
        lpTokenId = tokenId;
        isFinalized = true;
        currentPhase = Phase.Finalized;
        emit CurveFinalized(pool, tokenId);
    }
    receive() external payable {}
    /**
     * @notice Withdraw allocated tokens after curve finalization
     * @dev Can only be called after curve is finalized and only by addresses with allocations
     * @param recipient Address to receive the tokens
     */
    // Token allocation withdrawal removed (no PreBonding locks)
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