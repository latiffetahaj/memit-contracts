module.exports = async function ({ deployments, getNamedAccounts, }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const owner = "0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6";
    const SleepEscrow = await deployments.get("SleepEscrow");
    await deploy("EscrowFactory", {
        from: deployer,
        args: [owner, SleepEscrow.address],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["EscrowFactory"];
module.exports.dependencies = ['SleepEscrow'];