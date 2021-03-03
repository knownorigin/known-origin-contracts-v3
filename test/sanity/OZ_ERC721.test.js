const { constants } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const {
    shouldBehaveLikeERC721,
    shouldBehaveLikeERC721Metadata,
} = require('./OZ_ERC721.behavior.test');

describe('ERC721', function () {

    const name = "KnownOriginDigitalAsset";
    const symbol = "KODA";
    const STARTING_EDITION = "10000";

    beforeEach( async function() {

        const accounts = await ethers.getSigners();
        const addresses = accounts.map(a => a.address);
        const [owner, minter, contract] = addresses;

        // Legacy access controls
        const legacyAccessControlsContract = await ethers.getContractFactory("SelfServiceAccessControls");
        const legacyAccessControls = await legacyAccessControlsContract.deploy();

        // setup access controls
        const KOAccessControlsContract = await ethers.getContractFactory("KOAccessControls");
        this.accessControls = await KOAccessControlsContract.deploy(legacyAccessControls.address);

        // grab the roles
        this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
        this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

        // Set up access controls with minter roles
        await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
        await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

        // Create token V3
        const KnownOriginDigitalAssetV3Contract = await ethers.getContractFactory("KnownOriginDigitalAssetV3");
        this.token = await KnownOriginDigitalAssetV3Contract.deploy(this.accessControls.address,
            ZERO_ADDRESS, // no royalties address
            STARTING_EDITION
        );

        // Set contract roles
        await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});
        await this.accessControls.grantRole(this.CONTRACT_ROLE, contract, {from: owner});

    });

    shouldBehaveLikeERC721('ERC721');
    shouldBehaveLikeERC721Metadata('ERC721', name, symbol);
});