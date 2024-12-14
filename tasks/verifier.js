const { join } = require('path');

const { task } = require('hardhat/config');

const { submitSources } = require('./etherscan.js');
function getNetworkName(network) {
    if (process.env.HARDHAT_DEPLOY_FORK) {
        return process.env.HARDHAT_DEPLOY_FORK;
    }
    if ('forking' in network.config && (network.config.forking)?.network) {
        return (network.config.forking)?.network;
    }
    return network.name;
}
task("verifix", "Verify Specific contracts code")
    .setAction(async (taskArgs, hre) => {
        const contracts = [
            'BondingCurve',
            'Factory',
            'Lock',
            'TokenImplementation'
        ];
        const apiKey = hre.network.config.verify?.etherscan?.apiKey;
        const apiUrl = hre.network.config.verify?.etherscan?.apiUrl;
        const deployPath = hre.config.paths.deployments;
        const soucePath = join(deployPath, getNetworkName(hre.network), 'solcInputs');
        for (const contract of contracts) {
            try {
                await submitSources(hre, soucePath, {
                    contractName: contract,
                    etherscanApiKey: apiKey,
                    fallbackOnSolcInput: false,
                    forceLicense: false,
                    sleepBetween: true,
                    apiUrl,
                    writePostData: false
                });
            } catch (e) {
                console.log(`Could Not verify ${contract} : ${e.message}`);
                continue;
            }
        }
    });