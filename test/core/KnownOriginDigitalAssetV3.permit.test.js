const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS, MAX_UINT256} = constants;

const {
  bigNumberify,
  hexlify,
  keccak256,
  defaultAbiCoder,
  toUtf8Bytes,
  solidityPack,
  arrayify,
  splitSignature
} = require('ethers').utils;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');

contract('KnownOriginDigitalAssetV3 permit tests (ERC-2612)', function (accounts) {
  const [owner, minter, koCommission, contract, random] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');

  beforeEach(async () => {
    // setup access controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      ZERO_ADDRESS, // no GAS token for these tests
      ZERO_ADDRESS, // no royalties address
      STARTING_EDITION,
      {from: owner}
    );

    // Set contract roles
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
    await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    // Create marketplace and enable in whitelist
    this.marketplace = await KODAV3Marketplace.new(this.accessControls.address, this.token.address, koCommission, {from: owner})
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.marketplace.address, {from: owner});
  });

  it('name, symbol, version, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await token.name();
    expect(name).to.eq('KnownOriginDigitalAsset');
    expect(await token.symbol()).to.eq('KODA');
    expect(await token.version()).to.eq('3');
    expect((await token.getChainId()).toString()).to.eq("31337");
    expect(await token.DOMAIN_SEPARATOR()).to.eq(getDomainSeparator(name));
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 tokenId,uint256 nonce,uint256 deadline)'))
    );
  });

  it.skip("should set allowance for token ID after permit transaction", async () => {
    const signers = await ethers.getSigners();
    const tokenId = firstEditionTokenId;
    const spender = contract;

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    const nonce = await this.token.nonces(owner);
    const deadline = MAX_UINT256;
    console.log("internal nonce", nonce);
    console.log("internal deadline", deadline);

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);
    console.log("internal digest", digest);
    console.log("internal signer address", signers[0].address);
    console.log("internal DOMAIN_SEPARATOR", getDomainSeparator(await this.token.name()));
    console.log("internal PERMIT_TYPEHASH", PERMIT_TYPEHASH);

    // TODO see - https://github.com/Uniswap/uniswap-v2-core/blob/master/test/UniswapV2ERC20.spec.ts

    // Sign it ...
    // const signature = await signers[0].signMessage(Buffer.from(digest.slice(2), 'hex'));
    const signature = await signers[0].signMessage(arrayify(digest));
    const {r, s, v} = splitSignature(signature);
    console.log({r, s, v});

    // permit the approval - from a random account
    // const result = await this.token.permit(owner, spender, tokenId, deadline, v, arrayify(r), arrayify(s), {from: random});
    const result = await this.token.permit(owner, spender, tokenId, deadline, v, r, s, {from: random});
    expectEvent.inLogs(result, 'Approval', {
      owner: owner,
      approved: spender,
      tokenId: tokenId,
    });

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(spender);
    expect(await token.nonces(owner)).to.eq(bigNumberify(1));
  });

  const getDomainSeparator = (name) => {
    return keccak256(
      defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          keccak256(
            toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
          ),
          keccak256(toUtf8Bytes(name)), // KODA
          keccak256(toUtf8Bytes('3')), // V3
          31337, // local testnet chain ID
          this.token.address
        ]
      )
    )
  }

  const PERMIT_TYPEHASH = keccak256(
    toUtf8Bytes('Permit(address owner,address spender,uint256 tokenId,uint256 nonce,uint256 deadline)')
  );

  const getApprovalDigest = async (owner, spender, tokenId, nonce, deadline) => {
    // console.log({owner, spender, tokenId, nonce, deadline});
    const DOMAIN_SEPARATOR = getDomainSeparator(await this.token.name())
    return keccak256(
      solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          DOMAIN_SEPARATOR,
          keccak256(
            defaultAbiCoder.encode(
              ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, spender, tokenId.toString(), nonce.toString(), deadline.toString()]
            )
          )
        ]
      )
    )
  }

});
