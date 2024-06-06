module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("SLEEP", {
        from: deployer,
        log: true,
        deterministicDeployment: false,
    });
};
module.exports.tags = ["SLEEP", "coins"];