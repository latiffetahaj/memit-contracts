module.exports = async function ({ deployments, getNamedAccounts, ethers }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    // Get previously deployed implementations
    const tokenImplementation = await deployments.get("TokenImplementation");
    const bondingCurve = await deployments.get("BondingCurve");
    const lockImplementation = await deployments.get("Lock");
    const factoryImplementation = await deployments.get("Factory");
    // Deploy Foundry with implementations
    const initialDeploymentFee = ethers.parseEther("0.018"); // 0.1 ETH deployment fee
    await deploy("Foundry", {
        from: deployer,
        args: [
            factoryImplementation.address,
            lockImplementation.address,
            tokenImplementation.address,
            bondingCurve.address,
            initialDeploymentFee,
        ],
        log: true,
    });
};
module.exports.tags = ["Foundry"];
module.exports.dependencies = ["BondingCurve", "Factory", "Lock", "TokenImplementation"];