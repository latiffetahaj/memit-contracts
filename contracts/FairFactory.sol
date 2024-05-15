// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/INonfungiblePositionManager.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IERC20Minimal.sol";
import "./interfaces/IFairLaunch.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract FairFactory is Ownable {
    using Address for address payable;
    address public tokenImplementation;
    address public fairLaunchImplementation;
    uint256 public fees;

    event CLONE(
        address indexed creator,
        address indexed fairlaunch,
        address indexed token
    );
    struct Deploy {
        string name;
        string symbol;
        uint256 supply;
        IWETH9 weth;
        INonfungiblePositionManager uniswap;
    }

    constructor(
        address initialOwner,
        address _tokenImplementation,
        address _fairLaunchImplementation
    ) Ownable(initialOwner) {
        fees = 0.05 ether;
        tokenImplementation = _tokenImplementation;
        fairLaunchImplementation = _fairLaunchImplementation;
    }

    function updateFees(uint256 fee) external onlyOwner {
        fees = fee;
    }

    function create(
        Deploy calldata deploy
    ) external payable returns (IERC20Minimal token, address fairlaunch) {
        token = IERC20Minimal(Clones.clone(tokenImplementation));
        token.initialize(deploy.name, deploy.symbol, deploy.supply);
        fairlaunch = Clones.clone(fairLaunchImplementation);
        token.transfer(fairlaunch, deploy.supply);
        IFairLaunch.Setting memory settings = IFairLaunch.Setting({
            lpAdded: false,
            sleepfinance: owner(),
            team: _msgSender(),
            token: token,
            weth: deploy.weth,
            uniswap: deploy.uniswap,
            endTime: block.timestamp + 10 days
        });
        IFairLaunch(fairlaunch).initialize(settings);
        payable(owner()).sendValue(fees);
        emit CLONE(_msgSender(), fairlaunch, address(token));
    }

    /**
     * project dev remove any ERC20Tokens Sent here after Launch
     */
    function removeTokens(IERC20Minimal token) external {
        uint256 tbal = token.balanceOf(address(this));
        if (tbal > 0) token.transfer(owner(), tbal);
        uint256 ethBal = address(this).balance;
        if (ethBal > 0) payable(owner()).sendValue(ethBal);
    }
}
