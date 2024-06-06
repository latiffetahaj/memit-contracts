module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("DAI", {
        from: deployer,
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["DAI", "coins"];