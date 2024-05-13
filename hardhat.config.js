require("@nomicfoundation/hardhat-toolbox");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require("hardhat-abi-exporter");
require('hardhat-deploy');
require('hardhat-spdx-license-identifier');
require('hardhat-log-remover');
require('./tasks/verifier.js');
require('dotenv').config({ path: __dirname + '/.env' });
const { removeConsoleLog } = require("hardhat-preprocessor");
/** @type import('hardhat/config').HardhatUserConfig */
const accounts = {
    mnemonic: process.env.MNEMONIC,
    path: "m/44'/60'/0'/0", // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    initialIndex: 0,
    count: 200,
    passphrase: "",
};
module.exports = {
    preprocess: {
        eachLine: removeConsoleLog((bre) => bre.network.name !== "hardhat" && bre.network.name !== "localhost"),
    },
    mocha: {
        timeout: 120000
    },
    paths: {
        artifacts: "artifacts",
        cache: "cache",
        deploy: "deploy",
        deployments: "deployments",
        imports: "imports",
        sources: "contracts",
        tests: "test",
    },
    spdxLicenseIdentifier: {
        overwrite: false,
        runOnCompile: true,
        except: ['vendor/']
    },
    solidity: {
        compilers: [
            {
                version: "0.8.24",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            }
        ]
    },
    contractSizer: {
        alphaSort: false,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    defaultNetwork: 'hardhat',
    verify: {
        skipContracts: [],
        etherscan: {
            apiKey: process.env.ETHERSCAN_KEY,
        }
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        oracle: {
            default: 1,
        },
    },
    networks: {
        hardhat: {
            chainId: 30008,
            forking: {
                url: `https://rpc.ankr.com/eth/${process.env.ANKR_KEY}`,
                blockNumber: 19753235
            },
            accounts,
        },

        goerli: { // testing
            url: `https://goerli.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts,
            chainId: 5,
            live: true,
            saveDeployments: true,
            verify: {
                skipContracts: [],
                etherscan: {
                    apiKey: process.env.ETHERSCAN_KEY,
                    apiUrl: 'https://api-goerli.etherscan.io'
                }
            }
        },
        // BSC
        bsc: {
            url: "https://bsc-dataseed.binance.org",
            accounts,
            chainId: 56,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.BSCSCAN_KEY,
                    apiUrl: 'https://api.bscscan.com'
                }
            }

        },
        // ARBITRUM
        arbitrum: {
            url: "https://arb1.arbitrum.io/rpc",
            accounts,
            chainId: 42161,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.ARBISCAN_KEY,
                    apiUrl: 'https://api.arbiscan.io'
                }
            }
        },
        base: {
            url: "https://developer-access-mainnet.base.org",
            accounts,
            chainId: 8453,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.BASESCAN_KEY,
                    apiUrl: 'https://basescan.org/'
                }
            }
        },
        polygon: {
            url: "https://rpc.ankr.com/polygon/a2e2e0ee70153e9f9ea6eca45dbdce42021037389167d0e56825030f04213d1c",
            accounts,
            chainId: 137,
            live: true,
            gasMultiplier: 2,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.POLYGONSCAN_KEY,
                    apiUrl: 'https://api.polygonscan.com'
                }
            }
        },
        avalanche: {
            url: "https://api.avax.network/ext/bc/C/rpc",
            accounts,
            chainId: 43114,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.SNOWTRACE_KEY,
                    apiUrl: 'https://api.snowtrace.io'
                }
            }
        },
        sepolia: {
            url: `https://eth-sepolia.public.blastapi.io`,
            accounts,
            chainId: 11155111,
            live: true,
            saveDeployments: true,
            gasMultiplier: 3,
            verify: {
                skipContracts: [],
                etherscan: {
                    apiKey: process.env.ETHERSCAN_KEY,
                    apiUrl: 'https://api-sepolia.etherscan.io'
                }
            }
        },


    },
    gasReporter: {
        enabled: true,
        currency: 'USD',
        gasPrice: 3,
        coinmarketcap: '66e56a41-4420-45b3-ac5e-d874bd9fffb6',
        token: 'BNB',
        // gasPriceApi: "https://api-optimistic.etherscan.io/api?module=proxy&action=eth_gasPrice&apikey=WU61QQB9DF2R2PFH6YTHU8KRZIEU6ER4YU"
    }
};
