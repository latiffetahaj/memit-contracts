module.exports = async function ({ deployments, getNamedAccounts, getChainId }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const owner = "0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6";
    const signature = "0xf92cfD66626bDEfE9392f818cC75830B73e88548";
    const chainId = await getChainId();
    const usdts = {
        11155111: '0x6475e543a0EF140cD407b9385a8C09c29A5813f9',
        56: '0x55d398326f99059fF775485246999027B3197955',
        42161: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        43114: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        97: "0xbA875EE89e96cd4CC59dC5105e559DaC5C58bb7c",
        10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
        137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    };
    const usdt = usdts[chainId];
    await deploy("PrizeClaim", {
        from: deployer,
        args: [owner, signature, usdt],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["PrizeClaim"];