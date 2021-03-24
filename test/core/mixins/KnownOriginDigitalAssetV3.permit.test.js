const {BN, constants, expectEvent, expectRevert, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS, MAX_UINT256} = constants;
const {ecsign} = require('ethereumjs-util');

const {keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack} = require('ethers').utils;

const _ = require('lodash');

const {expect} = require('chai');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const KODAV3Marketplace = artifacts.require('KODAV3Marketplace');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KnownOriginDigitalAssetV3 permit tests (ERC-2612)', function (accounts) {

  const [owner, minter, koCommission, contract, random] = accounts;

  const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';

  const STARTING_EDITION = '10000';

  const ETH_ONE = ether('1');

  const firstEditionTokenId = new BN('11000');
  const secondEditionTokenId = new BN('12000');

  beforeEach(async () => {
    const legacyAccessControls = await SelfServiceAccessControls.new();

    // setup access controls
    this.accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
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

  it.skip('name, symbol, version, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
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
    const tokenId = firstEditionTokenId;
    const spender = contract;

    // We create a new wallet so we can grab the private key and use it later
    const wallet = ethers.Wallet.createRandom();
    const owner = wallet.address;

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    // get nonce
    const nonce = await this.token.nonces(owner);
    const deadline = MAX_UINT256;

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);

    // Sign it with the new wallet
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // permit the approval - from a random account
    const {logs} = await this.token.permit(owner, spender, tokenId, deadline, v, r, s, {from: random});
    expectEvent.inLogs(logs, 'Approval', {
      owner: owner,
      approved: spender,
      tokenId: tokenId,
    });

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(spender);
    expect(await token.nonces(owner)).to.be.bignumber.eq("1");
  });

  it.skip("should fail to permit is not signed by the owner", async () => {
    const tokenId = firstEditionTokenId;
    const spender = contract;

    // We create a new wallet so we can grab the private key and use it later
    const wallet = ethers.Wallet.createRandom();
    const owner = wallet.address;

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    // get nonce
    const nonce = await this.token.nonces(owner);
    const deadline = MAX_UINT256;

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);

    // Sign it with the new wallet
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // Failing to provider the right owner of the token
    await expectRevert(
      this.token.permit(contract, spender, firstEditionTokenId, deadline, v, r, s, {from: random}),
      "Invalid owner"
    );

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(ZERO_ADDRESS);
    expect(await token.nonces(owner)).to.be.bignumber.eq("0");
  });

  it.skip("should fail to permit if token does not exist", async () => {
    const tokenId = secondEditionTokenId;
    const spender = contract;

    // We create a new wallet so we can grab the private key and use it later
    const wallet = ethers.Wallet.createRandom();
    const owner = wallet.address;

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    // get nonce
    const nonce = await this.token.nonces(owner);
    const deadline = MAX_UINT256;

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);

    // Sign it with the new wallet
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // Failing to provider the right owner of the token
    await expectRevert(
      this.token.permit(minter, spender, tokenId, deadline, v, r, s, {from: random}),
      "ERC721_ZERO_OWNER"
    );

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(ZERO_ADDRESS);
    expect(await token.nonces(owner)).to.be.bignumber.eq("0");
  });

  it.skip("should fail to permit if deadline has passed", async () => {
    const tokenId = secondEditionTokenId;
    const spender = contract;

    // We create a new wallet so we can grab the private key and use it later
    const wallet = ethers.Wallet.createRandom();
    const owner = wallet.address;

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    // get nonce
    const nonce = await this.token.nonces(owner);
    const deadline = new BN("0"); // DEADLINE OF ZERO

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);

    // Sign it with the new wallet
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // Failing to provider the right owner of the token
    await expectRevert(
      this.token.permit(owner, spender, tokenId, deadline, v, r, s, {from: random}),
      "Deadline expired"
    );

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(ZERO_ADDRESS);
    expect(await token.nonces(owner)).to.be.bignumber.eq("0");
  });

  it.skip("should fail to permit if signed by the wrong account", async () => {
    const tokenId = firstEditionTokenId;
    const spender = contract;

    // We create a new wallet so we can grab the private key and use it later
    const wallet = ethers.Wallet.createRandom();

    const editionSize = 10;
    await this.token.mintBatchEdition(editionSize, owner, TOKEN_URI, {from: contract});

    // get nonce
    const nonce = await this.token.nonces(owner);
    const deadline = MAX_UINT256;

    // Generate digest
    const digest = await getApprovalDigest(owner, spender, tokenId, nonce, deadline);

    // Sign it with the rouge signer
    const {v, r, s} = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    // Failing to provider the right owner of the token
    await expectRevert(
      this.token.permit(owner, spender, tokenId, deadline, v, r, s, {from: random}),
      "INVALID_SIGNATURE"
    );

    // check spender is now approved
    expect(await token.getApproved(tokenId)).to.eq(ZERO_ADDRESS);
    expect(await token.nonces(owner)).to.be.bignumber.eq("0");
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

  const PERMIT_TYPEHASH = keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 tokenId,uint256 nonce,uint256 deadline)'));

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
