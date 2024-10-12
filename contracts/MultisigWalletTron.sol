// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.6;

import "openzeppelin-legacy/token/ERC20/IERC20.sol";
import "openzeppelin-legacy/token/ERC20/utils/SafeERC20.sol";
import "openzeppelin-legacy/utils/math/Math.sol";
import "openzeppelin-legacy/security/ReentrancyGuard.sol";

/// @title MultisigWallet
/// @notice A multi-signature wallet contract for managing ETH and ERC20 tokens
contract MultisigWalletTron is ReentrancyGuard {
    using SafeERC20 for IERC20;
    // List of wallet owners
    address[] public owners;
    // Mapping to check if an address is an owner
    mapping(address => bool) public isOwner;
    // Number of required confirmations
    uint public required;

    // Transaction structure
    struct Transaction {
        address tokenAddress;
        address to;
        uint256 value;
        bool executed;
        uint256 confirmations;
        bytes data;
    }

    // Mapping from transaction ID => owner => confirmation status
    mapping(uint256 => mapping(address => bool)) public confirmations;
    // List of transactions
    Transaction[] public transactions;

    /// @notice Modifier to check if the caller is an owner
    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    /// @notice Modifier to check if a transaction exists
    modifier txExists(uint256 txIndex) {
        if (txIndex >= transactions.length) revert TransactionDoesNotExist();
        _;
    }

    /// @notice Modifier to check if a transaction has not been executed
    modifier notExecuted(uint256 txIndex) {
        if (transactions[txIndex].executed) revert TransactionAlreadyExecuted();
        _;
    }

    /// @notice Modifier to check if a transaction has not been confirmed by the caller
    modifier notConfirmed(uint256 txIndex) {
        if (confirmations[txIndex][msg.sender]) revert TransactionAlreadyConfirmed();
        _;
    }

    // Events
    event Deposit(address indexed sender, uint256 value);
    event SubmitTransaction(address indexed owner, uint256 indexed txIndex, address indexed to, uint256 value, address tokenAddress, bytes data);
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);

    // Errors
    error NotOwner();
    error InvalidOwners();
    error InvalidRequiredConfirmations();
    error TransactionDoesNotExist();
    error TransactionNotConfirmed();
    error TransactionAlreadyExecuted();
    error TransactionAlreadyConfirmed();
    error InsufficientConfirmations();
    error TransferFailed();

    /// @notice Constructor to set up owners and required confirmations
    /// @param _owners Array of owner addresses
    /// @param _required Number of required confirmations
    constructor(address[] memory _owners, uint _required) {
        if (_owners.length == 0) revert InvalidOwners();
        if (_required == 0 || _required > _owners.length) revert InvalidRequiredConfirmations();

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            if (owner == address(0) || isOwner[owner]) revert InvalidOwners();

            isOwner[owner] = true;
            owners.push(owner);
        }

        required = _required;
    }

    /// @notice Fallback function to receive ETH
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Function to submit a transaction proposal
    /// @param tokenAddress Address of the token contract (use address(0) for ETH)
    /// @param to Recipient address
    /// @param value Amount to send
    /// @param data Additional data for the transaction
    function submitTransaction(address tokenAddress, address to, uint256 value, bytes calldata data)
    external
    onlyOwner
    {
        uint256 txIndex = transactions.length;

        transactions.push(Transaction({
            tokenAddress: tokenAddress,
            to: to,
            value: value,
            executed: false,
            confirmations: 0,
            data: data
        }));

        emit SubmitTransaction(msg.sender, txIndex, to, value, tokenAddress, data);
    }

    /// @notice Function to confirm a transaction
    /// @param txIndex Index of the transaction to confirm
    function confirmTransaction(uint256 txIndex)
    external
    onlyOwner
    txExists(txIndex)
    notExecuted(txIndex)
    notConfirmed(txIndex)
    {
        Transaction storage txn = transactions[txIndex];
        txn.confirmations += 1;
        confirmations[txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, txIndex);

        if (txn.confirmations >= required) {
            executeTransaction(txIndex);
        }
    }

    /// @notice Internal function to execute a confirmed transaction
    /// @param txIndex Index of the transaction to execute
    function executeTransaction(uint256 txIndex)
    internal
    txExists(txIndex)
    notExecuted(txIndex)
    nonReentrant
    {
        Transaction storage txn = transactions[txIndex];

        if (txn.confirmations < required) revert InsufficientConfirmations();

        txn.executed = true;

        if (txn.tokenAddress == address(0)) {
            (bool success, ) = txn.to.call{value: txn.value}(txn.data);
            if (!success) revert TransferFailed();
        } else {
            IERC20(txn.tokenAddress).safeTransfer(txn.to, txn.value);
            if (txn.data.length > 0) {
                (bool success, ) = txn.to.call(txn.data);
                if (!success) revert TransferFailed();
            }
        }

        emit ExecuteTransaction(msg.sender, txIndex);
    }

    /// @notice Function to revoke a confirmation
    /// @param txIndex Index of the transaction to revoke confirmation
    function revokeConfirmation(uint256 txIndex)
    external
    onlyOwner
    txExists(txIndex)
    notExecuted(txIndex)
    {
        if (!confirmations[txIndex][msg.sender]) revert TransactionNotConfirmed();

        confirmations[txIndex][msg.sender] = false;
        transactions[txIndex].confirmations -= 1;

        emit RevokeConfirmation(msg.sender, txIndex);
    }

    // Helper functions to get contract data
    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint256) {
        return transactions.length;
    }

    /// @notice Function to get transaction data
    /// @param txIndex Index of the transaction
    /// @return tokenAddress Address of the token contract
    /// @return to Recipient address
    /// @return value Amount to send
    /// @return executed Execution status of the transaction
    /// @return confirmations Number of confirmations
    /// @return data Additional data for the transaction
    function getTransaction(uint256 txIndex)
    external
    view
    txExists(txIndex)
    returns (
        address tokenAddress,
        address to,
        uint256 value,
        bool executed,
        uint256 confirmations,
        bytes memory data
    )
    {
        Transaction storage txn = transactions[txIndex];

        return (
            txn.tokenAddress,
            txn.to,
            txn.value,
            txn.executed,
            txn.confirmations,
            txn.data
        );
    }

    /// @notice Function to check if a transaction is confirmed by a specific owner
    /// @param txIndex Index of the transaction
    /// @param owner Address of the owner
    /// @return Returns true if the transaction is confirmed by the owner
    function isConfirmed(uint256 txIndex, address owner) external view returns (bool) {
        return confirmations[txIndex][owner];
    }
}
