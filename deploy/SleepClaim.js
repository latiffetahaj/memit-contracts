module.exports = async function ({ deployments, getNamedAccounts, }) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const owner = "0x91F708a8D27F2BCcCe8c00A5f812e59B1A5e48E6";
    const signature = "0xf92cfD66626bDEfE9392f818cC75830B73e88548";
    const sleep = await deployments.get("SLEEP");
    await deploy("SleepClaim", {
        from: deployer,
        args: [owner, signature, sleep.address],
        log: true,
        deterministicDeployment: false
    });
};
module.exports.tags = ["PrizeClaim"];
module.exports.dependencies = ["SLEEP"];