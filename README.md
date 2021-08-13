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

## Deployments

### Rinkeby

```
Core NFT                   - 0x109F508D59736cB7f27ec6f6bA83F4C49053bfe8 = (verified)
AccessControls             - 0xa992e8E7c0259e0757A1CBd5B7f181EEfF0Ec499 = (verified)
Minting Factory            - 0xA69F885ce6E55F397D9012a3177001b25bD5A979 = (verified)
Primary marketplace        - 0xC89A48D4903Df3f92dc93df88403F5ea136b92ae = (verified)
Secondary marketplace      - 0xc67bdA619E9e41239fABD091533652362a962b2c = (verified)
Collab royalties registry  - 0x9b4E02227952214e1cD4aE60ed757589f2DF9661 = (verified)
Omni deployer              - 0x90764bB20aC05A53eBE03dF17fc61abAbC1Ee059 = (verified)
V1 funds splitter          - 0x119f6fb742b9ace412f177875a169b23487fa664 = (verified) 
V1 funds receiver          - 0xb4bb0960b5095e5a0abd07d18803f45c4c4eadf6 = (verified) 
```

### Mainnet

```
Core NFT                   - 
AccessControls             - 
Minting Factory            - 
Primary marketplace        - 
Secondary marketplace      - 
Collab royalties registry  - 
Omni deployer              -
V1 funds splitter          - 
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
