module.exports = async function ({ deployments, getNamedAccounts, getChainId }) {
    const { deploy } = deployments;
    const chainId = await getChainId();
    const { deployer, ether, bnb, arbitrum, base, avalanche, blast, zora, linea, dev, apechain, polygon, incentiv} = await getNamedAccounts();

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
        59144: linea,
        11691: dev, // dev
        33139: apechain, // apechain
        137: polygon, // polygon
        28802: incentiv, // incentiv
    };
    await deploy("BondingCurve", {
        from: accounts[chainId],
        args: [],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["BondingCurve"];