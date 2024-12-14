# Bonding Curve Smart Contracts

This repository contains the smart contracts for a decentralized bonding curve system with pre-bonding capabilities and eventual migration to Uniswap V3, featuring LP NFT locking for security.

## Overview

The system implements a bonding curve mechanism with the following key features:

-   Pre-bonding phase for initial token distribution
-   Active trading phase with constant product AMM formula
-   Automatic migration to Uniswap V3
-   LP NFT locking for long-term security
-   Minimal proxy pattern (EIP-1167) for gas-efficient deployment

## System Architecture

### Core Contracts

-   **Foundry**: Main deployer contract that manages system deployment
-   **Factory**: Handles deployment of token and bonding curve instances
-   **TokenImplementation**: ERC20 token with one-time mint capability
-   **BondingCurve**: Implements the bonding curve mechanism
-   **Lock**: Manages Uniswap V3 LP NFT locking and fee claims

### Libraries

-   **BondingMath**: Handles price calculations and fee computations
-   **UniswapPoolCreator**: Manages Uniswap V3 pool creation and position management

## Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy the environment file:

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:

-   Set deployment accounts and private keys
-   Add API keys for various networks
-   Configure network-specific variables

## Testing

Run the test suite:

```bash
npm run test
```

For gas reporting:

```bash
npm run test:gas
```

For coverage report:

```bash
npm run test:coverage
```

## Deployment

The system supports deployment to multiple networks. Use the appropriate command for your target network:

```bash
# Sepolia Testnet
npm run sepolia:deploy
npm run sepolia:verify

# BSC
npm run bsc:deploy
npm run bsc:verify

# Base
npm run base:deploy
npm run base:verify

# Blast
npm run blast:deploy
npm run blast:verify

# Linea
npm run linea:deploy
npm run linea:verify

# Arbitrum
npm run arbitrum:deploy
npm run arbitrum:verify
```

## DApp Integration

The contracts are designed to work with the Memex DApp ([GitHub Repository](https://github.com/scriptoshi/memex)).

After deployment:

1. Run the export command to generate DApp-compatible files:

```bash
npm run done
```

2. This will create contract ABIs and addresses in the `/build` directory

3. To update the DApp:
    - Copy all files from `/build` to `/evm` in the DApp directory
    - Run `npm build` in the DApp directory to update the UI

For detailed DApp documentation, visit: [https://docs.memex.dcriptoshi.com](https://docs.memex.dcriptoshi.com)

## System Parameters

-   Initial Virtual ETH: 5 ETH
-   Pre-bonding Target: 5 ETH
-   Total Bonding Target: 30 ETH
-   Token Supply: 1,000,000,000
-   Lock Duration: 10 years
-   Trading Fee: Configurable by platform admin

## Security Features

-   LP NFT locking mechanism to prevent rug pulls
-   One-time mint restriction on tokens
-   No owner control after initialization
-   Fee collection mechanisms
-   Built on OpenZeppelin contracts
-   Comprehensive test coverage

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## Support

For technical support or questions, please refer to:

-   Documentation: [https://docs.memex.dcriptoshi.com](https://docs.memex.dcriptoshi.com)
-   GitHub Issues: Create an issue in the repository
