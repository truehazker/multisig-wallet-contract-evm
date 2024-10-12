import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  loadFixture,
  time
} from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('MultisigWallet', function () {
  const fixture = async () => {
    const [owner1, owner2, owner3, nonOwner, ...rest] = await ethers.getSigners();

    const MultisigWallet = await ethers.getContractFactory('MultisigWallet');
    const multisigWallet = await MultisigWallet.deploy([owner1.address, owner2.address, owner3.address], 2);

    const TestToken = await ethers.getContractFactory('TestToken');
    const testToken = await TestToken.deploy('Test Token', 'TST', ethers.parseEther('1000'));

    return {
      owner1,
      owner2,
      owner3,
      nonOwner,
      rest,
      multisigWallet,
      testToken
    };
  };

  describe('Deployment', function () {
    it('should deploy the MultisigWallet contract', async function () {
      const { multisigWallet } = await loadFixture(fixture);
      const address = await multisigWallet.getAddress();

      expect(address).to.be.properAddress;
    });

    it('should set the owners and required parameters', async function () {
      const {
        owner1,
        owner2,
        owner3,
        multisigWallet
      } = await loadFixture(fixture);
      const owners = await multisigWallet.getOwners();
      const required = await multisigWallet.required();

      expect(owners).to.have.length(3);
      expect([...owners]).to.have.members([owner1.address, owner2.address, owner3.address]);
      expect(required).to.equal(2);
    });

    it('should check that isOwner returns true for the owners', async function () {
      const {
        owner1,
        owner2,
        owner3,
        nonOwner,
        multisigWallet
      } = await loadFixture(fixture);

      expect(await multisigWallet.isOwner(owner1.address)).to.be.true;
      expect(await multisigWallet.isOwner(owner2.address)).to.be.true;
      expect(await multisigWallet.isOwner(owner3.address)).to.be.true;
      expect(await multisigWallet.isOwner(nonOwner.address)).to.be.false;
    });

    it('should revert when deploying with invalid owners or required confirmations', async function () {
      const MultisigWallet = await ethers.getContractFactory('MultisigWallet');

      await expect(MultisigWallet.deploy([], 1)).to.be.revertedWithCustomError(MultisigWallet, 'InvalidOwners');
      await expect(MultisigWallet.deploy([ethers.ZeroAddress], 1)).to.be.revertedWithCustomError(MultisigWallet, 'InvalidOwners');
      await expect(MultisigWallet.deploy([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address], 0)).to.be.revertedWithCustomError(MultisigWallet, 'InvalidRequiredConfirmations');
      await expect(MultisigWallet.deploy([ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address], 3)).to.be.revertedWithCustomError(MultisigWallet, 'InvalidRequiredConfirmations');
    });
  });

  describe('Transactions', function () {
    it('should submit a transaction', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await expect(multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data))
        .to.emit(multisigWallet, 'SubmitTransaction')
        .withArgs(owner1.address, 0, to, value, ethers.ZeroAddress, data);

      const txCount = await multisigWallet.getTransactionCount();
      expect(txCount).to.equal(1);

      const tx = await multisigWallet.getTransaction(0);
      expect(tx.to).to.equal(to);
      expect(tx.value).to.equal(value);
      expect(tx.data).to.equal(data);
      expect(tx.executed).to.be.false;
      expect(tx.confirmations).to.equal(0);
    });

    it('should confirm a transaction', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);

      await expect(multisigWallet.connect(owner2).confirmTransaction(0))
        .to.emit(multisigWallet, 'ConfirmTransaction')
        .withArgs(owner2.address, 0);

      const tx = await multisigWallet.getTransaction(0);
      expect(tx.confirmations).to.equal(1);
      expect(await multisigWallet.isConfirmed(0, owner2.address)).to.be.true;
    });

    it('should execute a transaction when required confirmations are met', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      // First we need to top up the wallet
      await owner1.sendTransaction({
        to: multisigWallet.getAddress(),
        value: ethers.parseEther('10')
      });

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);

      await expect(multisigWallet.connect(owner2).confirmTransaction(0))
        .to.emit(multisigWallet, 'ExecuteTransaction')
        .withArgs(owner2.address, 0);

      const tx = await multisigWallet.getTransaction(0);
      expect(tx.executed).to.be.true;
    });

    it('should revoke a confirmation', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);

      await expect(multisigWallet.connect(owner1).revokeConfirmation(0))
        .to.emit(multisigWallet, 'RevokeConfirmation')
        .withArgs(owner1.address, 0);

      const tx = await multisigWallet.getTransaction(0);
      expect(tx.confirmations).to.equal(0);
      expect(await multisigWallet.isConfirmed(0, owner1.address)).to.be.false;
    });

    it('should handle ERC20 token transfers', async function () {
      const {
        owner1,
        owner2,
        multisigWallet,
        testToken
      } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('10');
      const data = '0x';

      await testToken.transfer(multisigWallet.getAddress(), value);

      await multisigWallet.connect(owner1).submitTransaction(testToken.getAddress(), to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);
      await multisigWallet.connect(owner2).confirmTransaction(0);

      expect(await testToken.balanceOf(to)).to.equal(value);
    });

    it('should handle ERC20 token transfers with additional data', async function () {
      const {
        owner1,
        owner2,
        multisigWallet,
        testToken
      } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('10');
      const data = testToken.interface.encodeFunctionData('approve', [to, value]);

      await testToken.transfer(multisigWallet.getAddress(), value);

      await multisigWallet.connect(owner1).submitTransaction(testToken.getAddress(), testToken.getAddress(), 0, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);
      await multisigWallet.connect(owner2).confirmTransaction(0);

      expect(await testToken.allowance(multisigWallet.getAddress(), to)).to.equal(value);
    });
  });

  describe('Error cases', function () {
    it('should revert when non-owner tries to submit a transaction', async function () {
      const { nonOwner, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await expect(multisigWallet.connect(nonOwner).submitTransaction(ethers.ZeroAddress, to, value, data))
        .to.be.revertedWithCustomError(multisigWallet, 'NotOwner');
    });

    it('should revert when confirming a non-existent transaction', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);

      await expect(multisigWallet.connect(owner1).confirmTransaction(0))
        .to.be.revertedWithCustomError(multisigWallet, 'TransactionDoesNotExist');
    });

    it('should revert when confirming an already confirmed transaction', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);

      await expect(multisigWallet.connect(owner1).confirmTransaction(0))
        .to.be.revertedWithCustomError(multisigWallet, 'TransactionAlreadyConfirmed');
    });

    it('should revert when revoking a confirmation for a non-existent transaction', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);

      await expect(multisigWallet.connect(owner1).revokeConfirmation(0))
        .to.be.revertedWithCustomError(multisigWallet, 'TransactionDoesNotExist');
    });

    it('should revert when revoking a non-confirmed transaction', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);

      await expect(multisigWallet.connect(owner2).revokeConfirmation(0))
        .to.be.revertedWithCustomError(multisigWallet, 'TransactionNotConfirmed');
    });

    it('should revert when executing a transaction that fails', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1000'); // More than the contract balance
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);

      await expect(multisigWallet.connect(owner2).confirmTransaction(0))
        .to.be.revertedWithCustomError(multisigWallet, 'TransferFailed');
    });
  });

  describe('Receive function', function () {
    it('should accept ETH and emit Deposit event', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);
      const value = ethers.parseEther('1');

      await expect(owner1.sendTransaction({
        to: multisigWallet.getAddress(),
        value
      }))
        .to.emit(multisigWallet, 'Deposit')
        .withArgs(owner1.address, value);

      expect(await ethers.provider.getBalance(multisigWallet.getAddress())).to.equal(value);
    });
  });

  describe('Helper functions', function () {
    it('should return the correct list of owners', async function () {
      const {
        owner1,
        owner2,
        owner3,
        multisigWallet
      } = await loadFixture(fixture);
      const owners = await multisigWallet.getOwners();

      expect(owners).to.have.length(3);
      expect([...owners]).to.have.members([owner1.address, owner2.address, owner3.address]);
    });

    it('should return the correct transaction count', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      expect(await multisigWallet.getTransactionCount()).to.equal(0);

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      expect(await multisigWallet.getTransactionCount()).to.equal(1);

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      expect(await multisigWallet.getTransactionCount()).to.equal(2);
    });

    it('should return the correct transaction details', async function () {
      const { owner1, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x1234';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      const tx = await multisigWallet.getTransaction(0);

      expect(tx.tokenAddress).to.equal(ethers.ZeroAddress);
      expect(tx.to).to.equal(to);
      expect(tx.value).to.equal(value);
      expect(tx.executed).to.be.false;
      expect(tx.confirmations).to.equal(0);
      expect(tx.data).to.equal(data);
    });

    it('should correctly check if a transaction is confirmed by an owner', async function () {
      const { owner1, owner2, multisigWallet } = await loadFixture(fixture);
      const to = ethers.Wallet.createRandom().address;
      const value = ethers.parseEther('1');
      const data = '0x';

      await multisigWallet.connect(owner1).submitTransaction(ethers.ZeroAddress, to, value, data);
      await multisigWallet.connect(owner1).confirmTransaction(0);

      expect(await multisigWallet.isConfirmed(0, owner1.address)).to.be.true;
      expect(await multisigWallet.isConfirmed(0, owner2.address)).to.be.false;
    });
  });
});
