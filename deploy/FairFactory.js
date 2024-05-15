module.exports = async function ({ deployments, getNamedAccounts, }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const token = await deployments.get("Token");
    const fairlaunch = await deployments.get("Fairlaunch");
    const owner = "0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6";
    await deploy("FairFactory", {
        from: deployer,
        args: [owner, token.address, fairlaunch.address],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["factory"];
module.exports.dependencies = ["Token", "Fairlaunch"];