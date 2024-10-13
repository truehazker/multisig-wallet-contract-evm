# MultisigWallet

A robust and secure multi-signature wallet implementation for Ethereum and Tron blockchains.

## Overview

This project implements a multi-signature wallet smart contract that allows multiple owners to manage funds
collectively. It supports both native cryptocurrency (ETH/TRX) and ERC20 token transactions, providing a secure way to
manage shared funds or implement complex governance structures.

## Features

- Multiple wallet owners
- Configurable number of required confirmations
- Support for native cryptocurrency and ERC20 tokens
- Transaction proposal, confirmation, and execution
- Confirmation revocation
- Reentrancy protection
- Comprehensive error handling
- Event emission for all major actions

## Contracts

The project includes two main contracts:

1. `MultisigWallet.sol`: For Ethereum-based networks
2. `MultisigWalletTron.sol`: For Tron network (with slight modifications to accommodate Tron's specifics)

## Getting Started

### Prerequisites

- Node.js (v14 or later recommended)
- Yarn package manager
- Hardhat

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/multisig-wallet-contract-evm.git
   cd multisig-wallet-contract-evm
   ```

2. Install dependencies:
   ```
   yarn install
   ```

### Compilation

Compile the contracts using Hardhat:

```
yarn compile
```

### Testing

Run the test suite:

```
yarn test
```

## Deployment

The project includes a Hardhat Ignition module for easy deployment. You can find it in the
`ignition/modules/MultisigWallet.ts` file.

To deploy using Hardhat Ignition:

1. Set up your deployment configuration in `hardhat.config.ts`
2. Run the deployment command:
   ```
   npx hardhat ignition deploy ignition/modules/MultisigWallet.ts
   ```

## Security

This contract has not been audited. Use at your own risk in production environments.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the UNLICENSED License - see the LICENSE file for details.

## Acknowledgments

- OpenZeppelin for their secure contract implementations
- Hardhat for the development environment
- The Ethereum and Tron communities for their continuous support and innovation
