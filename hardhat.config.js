require('dotenv').config();
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require('solidity-coverage');
require('hardhat-gas-reporter');
require('@nomiclabs/hardhat-solhint');
require('hardhat-contract-sizer')

const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

let nonDevelopmentNetworks = {}

// If we have a private key, we can setup non dev networks
if (PRIVATE_KEY) {
  nonDevelopmentNetworks = {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${PRIVATE_KEY}`]
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${PRIVATE_KEY}`]
    },
  }
}

module.exports = {
  solidity: {
    version: "0.7.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 2000
      }
    }
  },
  gasReporter: {
    currency: 'USD',
    enabled: (process.env.REPORT_GAS) ? true : false,
    gasPrice: 100,
    coinmarketcap: "208cdaa4-cf6a-434b-801a-35b46f00cec1", // FIXME re-gen and export this to CI
    showTimeSpent: true,
    showMethodSig: true,
  },
  networks: {
    ...nonDevelopmentNetworks,
    coverage: {
      url: 'http://localhost:8555',
    }
  },
};
