const { constants } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const {
    shouldBehaveLikeERC721,
    shouldBehaveLikeERC721Metadata,
} = require('./OZ_ERC721.behavior.test');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const KOAccessControls = artifacts.require('KOAccessControls');

contract('ERC721', function (accounts) {
    const [owner, minter, contract] = accounts;
    const name = "KnownOriginDigitalAsset";
    const symbol = "KODA";
    const STARTING_EDITION = "10000";

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

    });

    shouldBehaveLikeERC721('ERC721', accounts);
    shouldBehaveLikeERC721('ERC721', name, symbol, accounts);
});