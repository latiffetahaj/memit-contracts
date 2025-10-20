module.exports = async function ({ deployments, getChainId, getNamedAccounts, }) {
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer, ether, bnb, arbitrum, base, avalanche, linea, blast, zora, incentiv } = await getNamedAccounts();
    const accounts = {
        1: ether, // mainnet
        11155111: deployer, // sepolia
        56: bnb, // BSC
        42161: arbitrum, // 
        8453: base, // base
        43114: avalanche, // avalanche
        7777777: zora, // Zora
        999999999: zora, // Zora Sepolia,
        81457: blast, // 
        59144: linea,
        28802: incentiv
    };
    await deploy("TokenImplementation", {
        from: accounts[chainId],
        args: [],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["TokenImplementation"];