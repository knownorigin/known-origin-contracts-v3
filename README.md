
<h1 align="center">KnownOrigin V3 Smart Contracts</h1>
<div align="center">
  Discover, buy and collect rare digital artwork
</div>

<br />

<div align="center">
  <a href="https://www.ethereum.org/" target="_blank"><img src="https://img.shields.io/badge/platform-Ethereum-brightgreen.svg?style=flat-square" alt="Ethereum" /></a>
  <a href="http://erc721.org/" target="_blank"><img src="https://img.shields.io/badge/token-ERC721-ff69b4.svg?style=flat-square" alt="Token ERC721" /> </a>
  <a href="https://eips.ethereum.org/EIPS/eip-2981" target="_blank"><img src="https://img.shields.io/badge/token-ERC2891-ff69b4.svg?style=flat-square" alt="ERC2891 Compliant" /> </a>
  <a href="https://eips.ethereum.org/EIPS/eip-998" target="_blank"><img src="https://img.shields.io/badge/token-ERC998-ff69b4.svg?style=flat-square" alt="ERC998 Composable" /> </a>
  <img src="https://img.shields.io/badge/contributions-welcome-orange.svg?style=flat-square" alt="Contributions Welcome" />
</div>

<br />

## Core Guiding Principles & Features


* GAS efficient - every byte counts, store only what is required `creator`, `edition size` & `metadata` but ensuring onchain provence
* [ERC-721](https://eips.ethereum.org/EIPS/eip-721) compliant NFTs
    * Ability to mint single 1 of 1 NFTs
    * Ability to mint batches of NFT (multi-editions)
    * Collaboration support for `1..n` collaborators with royalties - predetermined addresses
    * Generalise feature set to work with all KO artists and collectors in a modula fashion
* Immutable by design with onchain purchase and bidding histories
    * Creative works deserve traceable onchain histories, think of the future!
* Replace whitelisting with merkle proofs for minting access to reduce operational overheads
* Support for [ERC-2981: Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
* Support for [ERC-998 Top-down ERC-20 composable](https://eips.ethereum.org/EIPS/eip-998) (optional)
  * Single composable `ERC721`
  * Multiple composable `ERC20`
* Support for [ERC-2309: Consecutive batch mint](https://eips.ethereum.org/EIPS/eip-2309) (optional)
* Support for [Rarible V2 royalties standard](https://docs.rarible.com/asset/royalties-schema) (optional)
* Support for a proxy management account for creatives (optional)
* Support programmable/dynamic token URIs in the future (future iteration)
* Support metadata updates before the first sale has been made (optional)
* Sealed Metadata: Support to set a one time `perma-web` backup of token metadata
* Sales mechanics (see `./marketplace`)
  * `primary` market
      * `Buy now` - includes start date
      * `Open Offers` - includes bidder lockout period and start date 
      * `Stepped sales` - linear price increases per purchase from an edition
      * `24hr reserve auctions` - includes start date, reserve price with 24hr countdown + 15min extension window
      * `Early access sales` - gated sales behind lists of collectors, customisable drop phases 
  * `secondary` market
      * `Buy now` - includes start date
      * `Open Token Offers` - offers made on a specific token 
      * `Open Edition Offers` - open offer on an edition, any edition owner can action 
      * `24hr reserve auctions` - includes start date, reserve price with 24hr countdown + 15min extension window

### GAS & Coverage

* `GAS` report can be found [here](./gas-report-output.md) and generated on demand via `npm run gas`
* Contract size report found [here](./contract-size.md) or generated on demand via `npm run contract-size`
* Code coverage generation via `npm run coverage` output in `./coverage` folder

### Audits

* Public audits can be seen in `audits` 
  * Core NFT and marketplaces - CoinFabrik audit can be seen [here](https://blog.coinfabrik.com/known-origin-digital-asset-audit/) 
  * Early access / gated sales - CoinFabrik audit can be seen **Awaiting published results**

### Subgraph

* KO uses a mixture of public Subgraph and a currently private indexer to create a view on-top of these contracts 
  * Subgraph can be accessed [here](https://thegraph.com/legacy-explorer/subgraph/knownorigin/known-origin)
  * Subgraph source code be accessed [here](https://github.com/knownorigin/known-origin-subgraph)

## Deployments

-----

## Mainnet

```
Core NFT                   - 0xABB3738f04Dc2Ec20f4AE4462c3d069d02AE045B = (verified)  
AccessControls             - 0x9028b16494a9363F3EAaf381a6Fde67296abc68C = (verified) 
Minting Factory            - 0x36CF31019816E9490959F75Ba9164eDd304De01D = (verified) 
Primary marketplace        - 0xf11ED77fD65840b64602526DDC38311E9923c81B = (verified) 
Secondary marketplace      - 0x0Eb65B4c3d3dE340e1b15384f8F211784247a37A = (verified) 
Collab royalties registry  - 0xe28e054d596576841682e8c993E415B3ccB2EBeB = (verified)  
Omni deployer              - 0x0FE06547a21AdfbA812E7d986de4369b2cB3dde2 = 
V1 funds splitter          - 0xbc20c6582259f440ae628819be80062a576f06ed = (verified) 
V1 funds receiver          - 0x643ea212F5B9E5BE9f3A000430DCc80E01C78C2C = (verified) 
```

#### Gated marketplace (upgradable)
```
KODAV3GatedMarketplace Proxy - 0x8fC72C856EB661F072F0f7322449f3fcCF088f42 (verified) 
  - v1 - git commit 3bcd94f66e5d0f6b38881fd52971c13dd08b6974
```

#### Minting Factory (upgradable)
```
MintingFactoryV2 Proxy - 0xcEcF098DC0F513C68a0003b540CBDAE130dD0014
  - v1 - git commit 3bcd94f66e5d0f6b38881fd52971c13dd08b6974
```

-----

## Rinkeby

```
Core NFT                   - 0x3abC8C65A9516D5B487A9F7423aE2C4c6a3Adf51 = (verified)  
AccessControls             - 0x64699bC10a4E4639eD319397200CF16fa0aD1Fc9 = (verified) 
Minting Factory            - 0x35668a2Fd45452231a2639edcb887cD45951e597 = (verified) 
Primary marketplace        - 0x4B7A8Ce7d004C5c68207F355F6A838C941FF6B96 = (verified) 
Secondary marketplace      - 0x1f31f522b51cd5cB847c7228fE3bF9916800aaDe = (verified) 
Collab royalties registry  - 0x3005BB70CF6099e919Fb2E846abC8Fa1C710f613 = (verified)  
Omni deployer              - 0x90764bB20aC05A53eBE03dF17fc61abAbC1Ee059 = (verified)
V1 funds splitter          - 0x119f6fb742b9ace412f177875a169b23487fa664 = (verified) 
V1 funds receiver          - 0xb4bb0960b5095e5a0abd07d18803f45c4c4eadf6 = (verified) 
```

#### Gated marketplace (upgradable)
```
KODAV3GatedMarketplace Proxy - 0x048b36a7cc30127cE2C2C8E1C6AF9c3d0D8787eC
  - v1 - git commit 5c8b8e05b96b2439b65abea52a0d30112dc97ed9
```

#### Minting Factory (upgradable)
```
MintingFactoryV2 Proxy - 0x2346b3949F8742f4e2a8B6F26D72ef358683820d
  - v1 - git commit 5c8b8e05b96b2439b65abea52a0d30112dc97ed9
```

-----

### How to?

Use `hardhat` deploy for - see `/scripts` folder for more info e.g.

`npx hardhat run --network rinkeby ./scripts/X_my_script.js`

To verify also try hardhat but this sometimes fails, and you need to use the flat contracts.

