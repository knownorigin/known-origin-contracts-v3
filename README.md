# KnownOrigin V3 Smart Contracts

## Core Guiding Principles & Features

* GAS efficient - every byte counts, store only what is required `creator`, `edition size` & `metadata` but ensuring onchain provence
* [ERC-721](https://eips.ethereum.org/EIPS/eip-721) compliant NFTs
    * Ability to mint single 1 of 1 NFTs
    * Ability to mint batches of NFT (multi-editions)
    * Collaboration support for `1..n` collaborators with royalties - predetermined addresses
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
  * `secondary` market
      * `Buy now` - includes start date
      * `Open Token Offers` - offers made on a specific token 
      * `Open Edition Offers` - open offer on an edition, any edition owner can action 
      * `24hr reserve auctions` - includes start date, reserve price with 24hr countdown + 15min extension window

### GAS & Coverage

* `GAS` report can be found [here](./gas-report-output.md) and generated on demand via `npm run gas`
* Contract size report found [here](./contract-size.md) or generated on demand via `npm run contract-size`
* Code coverage generation via `npm run coverage` output in `./coverage` folder

![alt text](./code-coverage.png)

## Deployments

### Rinkeby

```
Core NFT                   - 0x66ED505Df51A030334cd6dBBBF7D479C86Fb6c87 = (verified)
AccessControls             - 0xB078C9E804cAcBD4C20161FB7F3af464dE960349 = (verified)
Minting Factory            - 0x7D00FBC839fd717C81347E420A094000689577Ed = (verified)
Primary marketplace        - 0xF2aB0aACE7ddF0801192Aa4aF94E5E3a5996189a = (verified)
Secondary marketplace      - 0xCe066692B88387AD7C87a0DF6147233471f32465 = (verified)
Collab royalties registry  - 0x7cf9212F430B58C894057bC76A3FCAB1ce347B2c = (verified)
Omni deployer              - 0xCb9f819Dc5Cf25AB1719Cd2ed91d9F5e2aC0D214 = (verified)
V1 funds splitter          - 0x9C7520747e7ec7aE7fa8314fC7463d7590785b01 = (verified) 
V1 funds receiver          - 0x6045ef85B6337b1a5cBb331413f5b712DE503f17 = (verified) 
```

### Mainnet

```
NFT                        - 
AccessControls             - 
Minting Factory            - 
Primary marketplace        - 
Secondary marketplace      - 
Collab royalties registry  - 
V1 funds reciever           - 
```

### How to?

Use `hardhat` deploy for - see `/scripts` folder for more info e.g.

`npx hardhat run --network rinkeby ./scripts/X_my_script.js`

To verify also try hardhat but this sometimes fails, and you need to use the flat contracts.

### Minting controls via merkle tree

1. Get enabled creators
```
node ./utils/v3-migration/1_gather_and_generate_data.js
```

2. Create proofs
```
node ./utils/v3-migration/2_create_and_store_merkle_tree.js
```

3. Update access controls with these values - refresh the web app
