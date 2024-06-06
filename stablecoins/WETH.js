module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("WETH", {
        from: deployer,
        log: true,
        deterministicDeployment: false,

    });
};
module.exports.tags = ["WETH", "coins"];