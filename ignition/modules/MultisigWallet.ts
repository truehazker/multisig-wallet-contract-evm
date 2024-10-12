import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const MultisigWalletModule = buildModule('MultisigWalletModule', (m) => {
  // Define parameters for the MultisigWallet constructor
  const owners = m.getParameter('owners', []);
  const required = m.getParameter('required', 0);

  // Deploy the MultisigWallet contract
  const multisigWallet = m.contract('MultisigWallet', [owners, required]);

  return { multisigWallet };
});

export default MultisigWalletModule;
