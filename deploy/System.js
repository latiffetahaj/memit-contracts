module.exports = async function ({ deployments, getNamedAccounts, ethers }) {

    const { deployer } = await getNamedAccounts();
    // Get deployed Foundry contract
    const foundry = await ethers.getContractAt(
        "Foundry",
        (await deployments.get("Foundry")).address
    );
    // Default bonding curve settings
    const settings = {
        virtualEth: ethers.parseEther("5"),
        preBondingTarget: ethers.parseEther("5"),
        bondingTarget: ethers.parseEther("30"),
        minContribution: ethers.parseEther("0.1"),
        poolFee: 3000, // 0.3%
        uniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        feeTo: deployer,
    };
    // Deploy system through Foundry
    const deploymentFee = await foundry.getDeploymentFee();
    const tx = await foundry.deploySystem(deployer, ethers.parseEther("0.1"), settings, {
        value: deploymentFee,
    });
    const receipt = await tx.wait();

    // Get deployed addresses from event
    const systemDeployedEvent = receipt.logs.find(
        (log) => log.fragment?.name === "SystemDeployed"
    );
    const [factoryAddress, lockAddress] = [
        systemDeployedEvent.args[0],
        systemDeployedEvent.args[1],
    ];
    console.log(factoryAddress, lockAddress);
};
module.exports.tags = ["System"];
module.exports.dependencies = ["Foundry"];