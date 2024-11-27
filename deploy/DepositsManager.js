module.exports = async function ({ deployments, getNamedAccounts, }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    await deploy("DepositsManager", {
        from: deployer,
        args: [],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["DepositsManager"];