module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("WBTC", {
        from: deployer,
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["WBTC", "coins"];