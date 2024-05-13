// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract Factory is Ownable {
    address public tokenImplementation;
    address public fairLaunchImplementation;
    address public sleepfinance;
     struct Deploy {
        string name,
        string symbol,
        uint256 supply,
        IWETH9 weth,
        INonfungiblePositionManager uniswap,
    }
    
    constructor(address initialOwner) Ownable(initialOwner) {


    }
   
    function deploy(Deploy deploy ) returns(address token, address fairlaunch){
        token = Clones.clone(tokenImplementation);
        IERC20Minimal(token).ininitialize(deploy.name,deploy.symbol,deploy.usupply)
        Setting memory settings = Setting({
            lpAdded:false,
            sleepfinance: sleepfinance,
            team: _msgSender(),
            token:IERC20Minimal(token),
            weth: deploy.weth,
            uniswap: deploy.uniswap,
            endTime: block.timestamp + 10 days;
        });

         
    }
}
