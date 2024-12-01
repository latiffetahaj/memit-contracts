const path = require('path');

const fse = require('fs-extra');
const make = async () => {
    const deployments = await fse.readJson('./exports/deployments.json');
    const chains = Object.keys(deployments);
    const data = {};
    for (const chain of chains) {
        const deploy = deployments[chain][0];
        for (const name in deploy.contracts) {
            const addresses = {
                ...data[name]?.addresses ?? {},
                [chain]: deploy.contracts[name].address,
            };
            data[name] = {
                addresses,
                abi: deploy.contracts[name].abi
            };
        }
    }

    for (const name in data) {
        const abiPath = `./build/${name}.json`;
        await fse.ensureDir(path.dirname(abiPath));
        fse.writeFile(abiPath, JSON.stringify(data[name]), "utf8");
    }
};
make();


