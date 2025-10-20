require("@nomicfoundation/hardhat-toolbox");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require("hardhat-abi-exporter");
require('hardhat-deploy');
require('hardhat-spdx-license-identifier');
require('hardhat-log-remover');
require('./tasks/verifier.js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const { removeConsoleLog } = require("hardhat-preprocessor");
/** @type import('hardhat/config').HardhatUserConfig */
const accounts = {
    mnemonic: process.env.MNEMONIC,
    // path: "m/44'/60'/0'/0", // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    initialIndex: 0,
    count: 200,
};
module.exports = {
    preprocess: {
        eachLine: removeConsoleLog((bre) => bre.network.name !== "hardhat" && bre.network.name !== "localhost" && bre.network.name !== "dev"),
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
                version: "0.8.20",
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
    defaultNetwork: 'incentiv',
    verify: {
        skipContracts: [],
        etherscan: {
            apiKey: process.env.ETHERSCAN_KEY,
        }
    },
    namedAccounts: {
        deployer: { default: 0 },
        ether: { default: 1 },
        bnb: { default: 2 },
        arbitrum: { default: 3 },
        base: { default: 4 },
        avalanche: { default: 5 },
        zora: { default: 6 },
        blast: { default: 7 },
        linea: { default: 8 },
        dev: { default: 0 },
        apechain: { default: 0 },
        polygon: { default: 0 },
        incentiv: { default: 0 }
    },
    networks: {
        incentiv: {
            url: process.env.RPC_URL,
            chainId: 28802,
            accounts: { mnemonic: process.env.MNEMONIC },
        },
        dev: {
            url: 'http://127.0.0.1:8545',
            chainId: 11691,
            accounts: { mnemonic: 'test test test test test test test test test test test junk' },
            },
        apechain: {
            url: "https://apechain.calderachain.xyz/http",
            accounts: { mnemonic: 'test test test test test test test test test test test junk' },
            chainId: 33139,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.APECHAINSCAN_KEY,
                    apiUrl: 'https://apechain.calderaexplorer.xyz/api/v2'
                }
            }
        },
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
        'bsc-testnet': {
            url: "https://data-seed-prebsc-1-s3.binance.org:8545",
            accounts,
            live: true,
            chainId: 97,
            // gasMultiplier: 2,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.BSCSCAN_KEY,
                    apiUrl: 'https://api-testnet.bscscan.com'
                }
            }
        },
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
        blast: {
            url: `https://rpc.ankr.com/blast/${process.env.INFURA_KEY}`,
            accounts,
            chainId: 81457,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.BLASTSCAN_KEY,
                    apiUrl: 'https://api.blastscan.io'
                }
            }

        },
        linea: {
            url: `https://rpc.ankr.com/linea/${process.env.INFURA_KEY}`,
            accounts,
            chainId: 59144,
            live: true,
            saveDeployments: true,
            verify: {
                etherscan: {
                    apiKey: process.env.LINEASCAN_KEY,
                    apiUrl: 'https://api.lineascan.build/'
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
                    apiUrl: 'https://api.basescan.org'
                }
            }
        },
        polygon: {
            url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts: { mnemonic: process.env.MNEMONIC },
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
            gasMultiplier: 0,
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
        coinmarketcap: `${process.env.CMCKEY}`,
        token: 'BNB',
        // gasPriceApi: "https://api-optimistic.etherscan.io/api?module=proxy&action=eth_gasPrice&apikey=WU61QQB9DF2R2PFH6YTHU8KRZIEU6ER4YU"
    }
};
