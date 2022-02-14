require('dotenv').config();
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require('solidity-coverage');
require('hardhat-gas-reporter');
require('@nomiclabs/hardhat-solhint');
require('hardhat-contract-sizer')
require("@nomiclabs/hardhat-etherscan");
require('hardhat-abi-exporter');

const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const KO_DEPLOYER_PRIVATE_KEY = process.env.KO_DEPLOYER_PRIVATE_KEY;

let nonDevelopmentNetworks = {}

// If we have a private key, we can setup non dev networks
if (KO_DEPLOYER_PRIVATE_KEY) {
  nonDevelopmentNetworks = {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${KO_DEPLOYER_PRIVATE_KEY}`]
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${KO_DEPLOYER_PRIVATE_KEY}`]
    },
  }
}

module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  gasReporter: {
    currency: 'USD',
    enabled: (process.env.REPORT_GAS) ? true : false,
    gasPrice: 75,
    coinmarketcap: process.env.COIN_MARKETCAP_KEY,
    showTimeSpent: true,
    showMethodSig: true,
  },
  networks: {
    ...nonDevelopmentNetworks,
    coverage: {
      url: 'http://localhost:8555',
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY
  },
  abiExporter: {
    path: './abis',
    clear: false,
    flat: true,
    only: [
      'ClaimableFundsReceiverV1',
      'ClaimableFundsSplitterV1',
      'CollabRoyaltiesRegistry',
      'KnownOriginDigitalAssetV3',
      'KOAccessControls',
      'KODAV3PrimaryMarketplace',
      'KODAV3SecondaryMarketplace',
      'KODAV3SecondaryMarketplace',
      'KODAV3GatedMarketplace',
      'MintingFactory',
    ],
    spacing: 2
  }
};
