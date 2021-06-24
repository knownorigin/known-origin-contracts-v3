# KnownOrigin V3 Smart Contracts

## The Core Guiding Principles

* GAS efficient - every byte counts, store only what is required `creator`, `edition size` & `metadata`
* [ERC-721](https://eips.ethereum.org/EIPS/eip-721) compliant NFTs
    * Ability to mint single 1 of 1 NFTs
    * Ability to mint batches of NFT (multi-editions)
    * Collaboration support for `1..n` collaborators with royalties
* Replace whitelisting with merkle proofs to reduce operational overheads 
* Support for [ERC-2981: Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
* Support for [ERC-998 Top-down ERC-20 composable](https://eips.ethereum.org/EIPS/eip-998) (optional)
* Support for [ERC-2309: Consecutive batch mint](https://eips.ethereum.org/EIPS/eip-2309) (optional)
* Support for a proxy management account for creatives (optional)
* Support programmable/dynamic token URIs in the future (future iteration)
* Support metadata updates before the first sale has been made (optional) 
* Sealed Metadata: Support to set a one time `perma-web` backup of token metadata

### Extras

* `GAS` report can be found [here](./gas-report-output.md) and generated on demand via `npm run gas`
* Code coverage generation via `npm run coverage` output in `./coverage` folder
* Contract size report found [here](./contract-size.md) or generated on demand via `npm run contract-size`

## Deployments

### Rinkeby

```
Core NFT                   - 0xf59DfBE431DE93E725AeF35aFf3EB4A0EF819aF2 (not verified)
AccessControls             - 0xB078C9E804cAcBD4C20161FB7F3af464dE960349 (verified)
Minting Factory            - 0x17fcD33fc32352FB15f46d66CE909C3DA815D657 (verified)
Primary marketplace        - 0x69FbdaDB09961F530C6209e7758eCA54FA635804 (verified)
Secondary marketplace      - 0x0E70f22F6333B08C9fb5044C65C5937420E72739 (verified)
```

### Mainnet

```
NFT                        - 
AccessControls             - 
Minting Factory            - 
Primary marketplace        - 
Secondary marketplace      - 
```

### How to?

Use `hardhat` deploy for - see `/scripts` folder for more info e.g.

`npx hardhat run --network rinkeby scripts/X_my_script.js`

To verify also try hardhat but this sometimes fails, and you need to use the flat contracts.
