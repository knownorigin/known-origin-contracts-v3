const {constants} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const {expect} = require('chai');

const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');

contract('KOAccessControls merkle proof tests', function (accounts) {
  const [deployer] = accounts;

  const merkleProof = {
    "merkleRoot": "0x0f0a8bfd5e14529c08426d9f0eea8fd737a1e35cee054ce67107b11724c26e25",
    "tokenTotal": "0x03",
    "claims": {
      "0xB9CcDD7Bedb7157798e10Ff06C7F10e0F37C6BdD": {
        "index": 0,
        "amount": "0x01",
        "proof": [
          "0x2388fd19f2887f60b302376d971d01dbb667f720fb9bfed2ed4cc2a4ab644a02"
        ]
      },
      "0xF3c6F5F265F503f53EAD8aae90FC257A5aa49AC1": {
        "index": 1,
        "amount": "0x01",
        "proof": [
          "0x5b47e330746be3185213a9741f3bcd1d82b2b1fbbcd833e3271880428d0e7b9b",
          "0xc8e8fc78d7229a113a4a84b1a268c0c91d4b2d818e42759e41e73afb6e9c129b"
        ]
      },
      "0xf94DbB18cc2a7852C9CEd052393d517408E8C20C": {
        "index": 2,
        "amount": "0x01",
        "proof": [
          "0x7b88d0c0c20b9a75266f972355391f9e1826d6963b12e7069b627bb7f2df9fa1",
          "0xc8e8fc78d7229a113a4a84b1a268c0c91d4b2d818e42759e41e73afb6e9c129b"
        ]
      }
    }
  };

  beforeEach(async () => {
    // setup access controls
    this.legacyAccessControls = await SelfServiceAccessControls.new();
    this.accessControls = await KOAccessControls.new(this.legacyAccessControls.address, {from: deployer});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // set the root hash
    await this.accessControls.updateArtistMerkleRoot(merkleProof.merkleRoot, {from: deployer});
  });

  describe('isVerifiedArtist() - success', async () => {
    it('should assert address whitelisted', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        0,
        "0xB9CcDD7Bedb7157798e10Ff06C7F10e0F37C6BdD",
        merkleProof.claims['0xB9CcDD7Bedb7157798e10Ff06C7F10e0F37C6BdD'].proof)
      ).to.be.equal(true);

      expect(await this.accessControls.isVerifiedArtist(
        1,
        "0xF3c6F5F265F503f53EAD8aae90FC257A5aa49AC1",
        merkleProof.claims['0xF3c6F5F265F503f53EAD8aae90FC257A5aa49AC1'].proof)
      ).to.be.equal(true);

      expect(await this.accessControls.isVerifiedArtist(
        2,
        "0xf94DbB18cc2a7852C9CEd052393d517408E8C20C",
        merkleProof.claims['0xf94DbB18cc2a7852C9CEd052393d517408E8C20C'].proof)
      ).to.be.equal(true);
    });
  });

  describe('isVerifiedArtist() - failures', async () => {
    it('should fail artist verification', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        0,
        deployer,
        merkleProof.claims['0xf94DbB18cc2a7852C9CEd052393d517408E8C20C'].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong index supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        1, // wrong index
        "0xf94DbB18cc2a7852C9CEd052393d517408E8C20C",
        merkleProof.claims['0xf94DbB18cc2a7852C9CEd052393d517408E8C20C'].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong proof supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        1,
        "0xF3c6F5F265F503f53EAD8aae90FC257A5aa49AC1",
        merkleProof.claims['0xf94DbB18cc2a7852C9CEd052393d517408E8C20C'].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when wrong account supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        0,
        "0xf94DbB18cc2a7852C9CEd052393d517408E8C20C",
        merkleProof.claims['0xB9CcDD7Bedb7157798e10Ff06C7F10e0F37C6BdD'].proof)
      ).to.be.equal(false);
    });

    it('should fail artist verification when zero address account supplied', async () => {
      expect(await this.accessControls.isVerifiedArtist(
        0,
        ZERO_ADDRESS,
        merkleProof.claims['0xB9CcDD7Bedb7157798e10Ff06C7F10e0F37C6BdD'].proof)
      ).to.be.equal(false);
    });
  });

});
