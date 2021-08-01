'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.parseBalanceMap = parseBalanceMap;

var _ethers = require('ethers');

var _balanceTree = _interopRequireDefault(require('./balance-tree'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {default: obj};
}

const {
  isAddress,
  getAddress
} = _ethers.utils; // This is the blob that gets distributed and pinned to IPFS.
// It is completely sufficient for recreating the entire merkle tree.
// Anyone can verify that all air drops are included in the tree,
// and the tree has no additional distributions.

function parseBalanceMap(balances) {
  // if balances are in an old format, process them
  const balancesInNewFormat = Array.isArray(balances) ? balances : Object.keys(balances).map(account => ({
    address: account,
    earnings: `0x${balances[account].toString(16)}`,
    reasons: ''
  }));
  const dataByAddress = balancesInNewFormat.reduce((memo, {
    address: account,
    earnings,
    reasons
  }) => {
    if (!isAddress(account)) {
      throw new Error(`Found invalid address: ${account}`);
    }

    const parsed = getAddress(account);
    if (memo[parsed]) throw new Error(`Duplicate address: ${parsed}`);

    const parsedNum = _ethers.BigNumber.from(earnings);

    if (parsedNum.lte(0)) throw new Error(`Invalid amount for account: ${account}`);
    const flags = {
      isSOCKS: reasons.includes('socks'),
      isLP: reasons.includes('lp'),
      isUser: reasons.includes('user')
    };
    memo[parsed] = {
      amount: parsedNum,
      ...(reasons === '' ? {} : {
        flags
      })
    };
    return memo;
  }, {});
  const sortedAddresses = Object.keys(dataByAddress).sort(); // construct a tree

  const tree = new _balanceTree.default(sortedAddresses.map(address => ({
    account: address,
    amount: dataByAddress[address].amount
  }))); // generate claims

  const claims = sortedAddresses.reduce((memo, address, index) => {
    const {
      amount,
      flags
    } = dataByAddress[address];
    memo[address] = {
      index,
      amount: amount.toHexString(),
      proof: tree.getProof(index, address, amount),
      ...(flags ? {
        flags
      } : {})
    };
    return memo;
  }, {});
  const tokenTotal = sortedAddresses.reduce((memo, key) => memo.add(dataByAddress[key].amount), _ethers.BigNumber.from(0));
  return {
    merkleRoot: tree.getHexRoot(),
    tokenTotal: tokenTotal.toHexString(),
    claims
  };
}
