module.exports = async function ({ deployments, getNamedAccounts, getChainId }) {
    const { deploy } = deployments;
    const { deployer, ether, bnb, arbitrum, base, avalanche, linea, zora, blast } = await getNamedAccounts();
    const accounts = {
        1: ether, // mainnet
        11155111: deployer, // sepolia
        56: bnb, // BSC
        42161: arbitrum, // 
        81457: blast, // 
        8453: base, // base
        43114: avalanche, // avalanche
        7777777: zora, // Zora
        999999999: zora, // Zora Sepolia
        59144: linea,
    };
    const chainId = await getChainId();
    // https://docs.uniswap.org/contracts/v3/reference/deployments/
    const positionManagers = {
        1: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88', // mainnet
        11155111: '0x1238536071E1c677A632429e3655c799b22cDA52', // sepolia
        56: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613', // BSC
        42161: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", // arbitrum
        8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1", // base
        43114: "0x655C406EBFa14EE2006250925e54ec43AD184f8B", // avalanche
        7777777: "0xbC91e8DfA3fF18De43853372A3d7dfe585137D78", // Zora
        999999999: "0xB8458EaAe43292e3c1F7994EFd016bd653d23c20", // Zora Sepolia
        81457: "0xB218e4f7cF0533d4696fDfC419A0023D33345F28", // Blast
        59144: "0x80C7DD17B01855a6D2347444a0FCC36136a314de", // Blast
    };

    const positionManager = positionManagers[chainId];
    await deploy("Lock", {
        from: accounts[chainId],
        args: [positionManager],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["Lock"];