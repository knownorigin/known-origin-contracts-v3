"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _merkleTree = _interopRequireDefault(require("./merkle-tree"));

var _ethers = require("ethers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class BalanceTree {
  constructor(balances) {
    this.tree = new _merkleTree.default(balances.map(({
                                                        account,
                                                        amount
                                                      }, index) => {
      return BalanceTree.toNode(index, account, amount);
    }));
  }

  static verifyProof(index, account, amount, proof, root) {
    let pair = BalanceTree.toNode(index, account, amount);

    for (const item of proof) {
      pair = _merkleTree.default.combinedHash(pair, item);
    }

    return pair.equals(root);
  } // keccak256(abi.encode(index, account, amount))


  static toNode(index, account, amount) {
    return Buffer.from(_ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [index, account, amount]).substr(2), 'hex');
  }

  getHexRoot() {
    return this.tree.getHexRoot();
  } // returns the hex bytes32 values of the proof


  getProof(index, account, amount) {
    return this.tree.getHexProof(BalanceTree.toNode(index, account, amount));
  }

}

exports.default = BalanceTree;