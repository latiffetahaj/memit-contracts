module.exports = async function ({ deployments, getNamedAccounts, ethers, getChainId }) {
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer, ether, bnb, arbitrum, base, blast, linea, avalanche, zora } = await getNamedAccounts();
    const accounts = {
        1: ether, // mainnet
        11155111: deployer, // sepolia
        56: bnb, // BSC
        42161: arbitrum, // 
        8453: base, // base
        43114: avalanche, // avalanche
        81457: blast, // 
        7777777: zora, // Zora
        999999999: zora, // Zora Sepolia
        59144: linea
    };
    // Get previously deployed implementations
    const tokenImplementation = await deployments.get("TokenImplementation");
    const bondingCurve = await deployments.get("BondingCurve");
    const lockImplementation = await deployments.get("Lock");
    const factoryImplementation = await deployments.get("Factory");
    // Deploy Foundry with implementations
    const initialDeploymentFee = ethers.parseEther("0.01814"); // 0.1 ETH deployment fee
    await deploy("Foundry", {
        from: accounts[chainId],
        args: [
            factoryImplementation.address,
            lockImplementation.address,
            tokenImplementation.address,
            bondingCurve.address,
            chainId === 56 ? initialDeploymentFee : ethers.parseEther("0.002649"),
        ],
        log: true,
    });
};
module.exports.tags = ["Foundry"];
module.exports.dependencies = ["BondingCurve", "Factory", "Lock", "TokenImplementation"];