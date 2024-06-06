module.exports = async function ({ deployments, getNamedAccounts, }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("SleepEscrow", {
        from: deployer,
        args: [],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["SleepEscrow"];
module.exports.dependencies = [];