## Royalties Registry Proxy for KODA V2

This is the working directory for the sample code for KO V2 royalties registry support. 

See: [https://royaltyregistry.xyz](https://royaltyregistry.xyz)

* `RoyaltyEngine` - https://etherscan.io/address/0x0385603ab55642cb4dd5de3ae9e306809991804f
* `RoylatyRegistry` - https://etherscan.io/address/0xad2184fb5dbcfc05d8f056542fb25b04fa32a95d

Methods:

* Method `getKODAV2RoyaltyInfo(address _tokenAddress, uint256 _id, uint256 _amount)`
  * This will return the list of accounts and amounts to pay royalties to

* Original PR to add the basic functionality https://github.com/manifoldxyz/royalty-registry-solidity/pull/27

#### Mainnet Deployment

`0x999082546a522eefdc64be8c2a15fdbc94db348d`

You can see it in action here: https://royaltyregistry.xyz/0xfbeef911dc5821886e1dda71586d90ed28174b7d/242853

#### Goerli Deployment

`0xa4ec0c66dbf9ef539524b4183d94c5d33948914b`

