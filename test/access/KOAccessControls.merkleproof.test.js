const {constants, expectEvent} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {expect} = require('chai');

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

const {parseBalanceMap} = require('../utils/parse-balance-map');

const {buildArtistMerkleInput} = require('../utils/merkle-tools');

contract('KOAccessControls merkle proof tests', function (accounts) {
  const [deployer, artist1, artist2, artist3, proxy] = accounts;

  beforeEach(async () => {
    // setup access controls
    this.legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: deployer});

    this.merkleProof = parseBalanceMap(buildArtistMerkleInput(1, artist1, artist2, artist3));

    // set the root hash
    await this.accessControls.updateArtistMerkleRoot(this.merkleProof.merkleRoot, {from: deployer});

  });

  describe('isVerifiedArtist() - success', async () => {
    it('should assert address whitelisted', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        this.merkleProof.claims[artist1].index,
        artist1,
        this.merkleProof.claims[artist1].proof)
      ).to.be.equal(true);

      expect(await this.accessControls.isVerifiedArtist.call(
        this.merkleProof.claims[artist2].index,
        artist2,
        this.merkleProof.claims[artist2].proof)
      ).to.be.equal(true);

      expect(await this.accessControls.isVerifiedArtist.call(
        this.merkleProof.claims[artist3].index,
        artist3,
        this.merkleProof.claims[artist3].proof)
      ).to.be.equal(true);
    });
  });

  describe('isVerifiedArtist() - failures', async () => {
    it('should fail artist verification', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        0,
        deployer,
        this.merkleProof.claims[artist1].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong index supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        1, // wrong index
        artist3,
        this.merkleProof.claims[artist3].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong proof supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        this.merkleProof.claims[artist1].index,
        artist1,
        merkleProof.claims[artist2].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong account supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        this.merkleProof.claims[artist3].index,
        artist1,
        merkleProof.claims[artist3].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when zero address account supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist.call(
        0,
        ZERO_ADDRESS,
        this.merkleProof.claims[artist1].proof)
      ).to.be.equal(false);
    });
  });

  describe('emits event when updateArtistMerkleRoot() called', async () => {
    it('emits event', async () => {
      const receipt = await this.accessControls.updateArtistMerkleRoot('0x012345', {from: deployer});
      expectEvent.inLogs(receipt.logs, 'AdminUpdateArtistAccessMerkleRoot', {
        _artistAccessMerkleRoot: '0x0123450000000000000000000000000000000000000000000000000000000000'
      });
      expect(await this.accessControls.artistAccessMerkleRoot()).to.be.equal('0x0123450000000000000000000000000000000000000000000000000000000000');
    });
  });

  describe('emits event when updateArtistMerkleRootIpfsHash() called', async () => {
    it('emits event', async () => {
      const receipt = await this.accessControls.updateArtistMerkleRootIpfsHash('my-new-string', {from: deployer});
      expectEvent.inLogs(receipt.logs, 'AdminUpdateArtistAccessMerkleRootIpfsHash', {
        _artistAccessMerkleRootIpfsHash: 'my-new-string'
      });
      expect(await this.accessControls.artistAccessMerkleRootIpfsHash()).to.be.equal('my-new-string');
    });
  });

  describe.only('verifiedArtistProxy - success', async () => {
    it('should assert enabled verified artist to set proxy', async () => {
      expect(await this.accessControls.artistProxy(artist1)).to.be.equal(ZERO_ADDRESS);

      await this.accessControls.setVerifiedArtistProxy(
        proxy,
        this.merkleProof.claims[artist1].index,
        this.merkleProof.claims[artist1].proof,
        {from: artist1}
      );

      expect(await this.accessControls.artistProxy(artist1)).to.be.equal(proxy);
      expect(await this.accessControls.artistProxy(artist2)).to.be.equal(ZERO_ADDRESS);
    });

    it('should assert isVerifiedArtistProxy', async () => {
      expect(await this.accessControls.isVerifiedArtistProxy(artist1, {from:proxy})).to.be.equal(false);

      await this.accessControls.setVerifiedArtistProxy(
        proxy,
        this.merkleProof.claims[artist1].index,
        this.merkleProof.claims[artist1].proof,
        {from: artist1}
      );

      expect(await this.accessControls.isVerifiedArtistProxy(artist1, {from:proxy})).to.be.equal(true);
    });
  });
});
