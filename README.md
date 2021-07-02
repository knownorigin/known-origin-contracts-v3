# KnownOrigin V3 Smart Contracts

## The Core Guiding Principles

* GAS efficient - every byte counts, store only what is required `creator`, `edition size` & `metadata`
* [ERC-721](https://eips.ethereum.org/EIPS/eip-721) compliant NFTs
    * Ability to mint single 1 of 1 NFTs
    * Ability to mint batches of NFT (multi-editions)
    * Collaboration support for `1..n` collaborators with royalties - predetermined addresses
* Replace whitelisting with merkle proofs for minting access
* Support for [ERC-2981: Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
* Support for [ERC-998 Top-down ERC-20 composable](https://eips.ethereum.org/EIPS/eip-998) (optional)
* Support for [ERC-2309: Consecutive batch mint](https://eips.ethereum.org/EIPS/eip-2309) (optional)
* Support for [Rarible V2 royalties standard](https://docs.rarible.com/asset/royalties-schema) (optional)
* Support for a proxy management account for creatives (optional)
* Support programmable/dynamic token URIs in the future (future iteration)
* Support metadata updates before the first sale has been made (optional)
* Sealed Metadata: Support to set a one time `perma-web` backup of token metadata

### GAS & Coverage

* `GAS` report can be found [here](./gas-report-output.md) and generated on demand via `npm run gas`
* Contract size report found [here](./contract-size.md) or generated on demand via `npm run contract-size`
* Code coverage generation via `npm run coverage` output in `./coverage` folder

## Deployments

### Rinkeby

```
Core NFT                   - 0xE1a362395D157Cc40FFA16E19a1Aa8Db27F7BF2e (verified)
AccessControls             - 0xB078C9E804cAcBD4C20161FB7F3af464dE960349 (verified)
Minting Factory            - 0x6005368E200604D0C5c974E91991BF654520a349 (verified)
Primary marketplace        - 0xDD7a80E419174713fe41C3Cb85F296663d20aFEc (verified)
Secondary marketplace      - 0x794a9609d4439c73F9D3f1Cbf8e222898851BA58 (verified)
Collab royalties registry  - 0x7B5e1dA2686D8F874108ff0604fdC94d8EeAa668 (verified)
V1 funds splitter          - 0xBEC19d918EBc50AEF6E1154D356741A02a888D07 (verified) 
V1 funds receiver          - 0x4D8A250e1f1EbcDCF15796b753b0a274b29Ac0e9 (verified) 
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

`npx hardhat run --network rinkeby scripts/X_my_script.js`

To verify also try hardhat but this sometimes fails, and you need to use the flat contracts.
