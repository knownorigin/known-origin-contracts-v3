const {BN, constants, expectEvent, expectRevert, balance} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const {expect} = require('chai');
const hre = require("hardhat");
const ethers = hre.ethers;
const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const SelfServiceAccessControls = artifacts.require('SelfServiceAccessControls');
const RoyaltyRegistry = artifacts.require("CollabRoyaltiesRegistry");
const RoyaltyImplV1 = artifacts.require('CollabFundsReceiver');
const MockERC20 = artifacts.require('MockERC20');

contract('Collaborator Royalty Funds Handler Architecture', function (accounts) {

    const [owner, artist1, artist2, artist3, admin, deployer, contract] = accounts;
    const TOKEN_URI = 'ipfs://ipfs/Qmd9xQFBfqMZLG7RA2rXor7SA7qyJ1Pk2F2mSYzRQ2siMv';
    const ZERO = new BN(0);
    const TWO = new BN(2);
    const THREE = new BN(3);
    const HALF = new BN(50000);
    const QUARTER = new BN(25000);
    const EDITION_ID = new BN(12000);
    const EDITION_ID_2 = new BN(13000);
    const TOKEN_ID = new BN(12001);
    const TOKEN_ID_2 = new BN(13001);
    const ROYALTY_AMOUNT = new BN(125000);
    const RECIPIENTS_3 = [artist1, artist2, artist3];
    const RECIPIENTS_2 = [artist1, artist2];
    const SPLITS_3 = [HALF, QUARTER, QUARTER];
    const SPLITS_2 = [HALF, HALF];
    const SEND_AMOUNT = "200";
    const ETH_AMOUNT = ethers.utils.parseEther(SEND_AMOUNT);
    const ERC20_AMOUNT = new BN("200000000000000000000"); // 200 * 10 ** 18
    const SCALE_FACTOR = "100000";
    const FUNDS_HANDLER_V1 = "v1";
    const STARTING_EDITION = '12000';

    let royaltyImplV1, royaltyProxy, royaltyProxy2,
        royaltyRegistry, accessControls, deployerAcct,
        token, erc20Token, proxyAddr, recipientTrackers, recipientBalances,
        contractTracker, DEFAULT_ADMIN_ROLE, CONTRACT_ROLE;

    beforeEach(async () => {

        const legacyAccessControls = await SelfServiceAccessControls.new();

        // setup access controls
        accessControls = await KOAccessControls.new(legacyAccessControls.address, {from: owner});

        // grab the roles
        DEFAULT_ADMIN_ROLE = await accessControls.DEFAULT_ADMIN_ROLE();
        CONTRACT_ROLE = await accessControls.CONTRACT_ROLE();

        // Create token V3
        token = await KnownOriginDigitalAssetV3.new(
            accessControls.address,
            ZERO_ADDRESS, // no royalties address
            STARTING_EDITION,
            {from: deployer}
        );

        // Set up access controls
        await accessControls.grantRole(DEFAULT_ADMIN_ROLE, admin, {from: owner});
        await accessControls.grantRole(CONTRACT_ROLE, contract, {from: owner});

        // Create royalty registry
        royaltyRegistry = await RoyaltyRegistry.new(accessControls.address, token.address);

        // ----------------------
        // Create implementations
        // ----------------------

        // Royalty Funds Handler V1: Receiver
        royaltyImplV1 = await RoyaltyImplV1.new(
            {from: owner}
        );

    });

    describe('Implementation', () => {

        context('RoyaltyImplV1: Funds Receiver Implementation', async () => {

            it('can be deployed', async () => {

                // Royalty Funds Handler V1: Receiver
                await RoyaltyImplV1.new(
                    {from: owner}
                );

            })

            context('init()', async () => {

                it('can be initialized', async () => {

                    // Royalty Funds Handler V1: Splitter
                    royaltyImplV1 = await RoyaltyImplV1.new(
                        {from: owner}
                    );

                    await royaltyImplV1.init(RECIPIENTS_3, SPLITS_3);

                })

            });

            context('once initialized', async () => {

                beforeEach(async () => {

                    await royaltyImplV1.init(RECIPIENTS_3, SPLITS_3);

                });

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV1.totalRecipients()).to.bignumber.equal(THREE);
                    })

                });

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyImplV1.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                        }

                    })

                });

                context('ICollabFundsDrainable functions', async () => {

                    beforeEach(async () => {

                        // Also send ETH to the contract
                        const [ownerSigner] = await ethers.getSigners();
                        await ownerSigner.sendTransaction({
                            to: royaltyImplV1.address,
                            value: ethers.utils.parseEther(SEND_AMOUNT)
                        });

                        // Initialize Trackers
                        contractTracker = await balance.tracker(royaltyImplV1.address);
                        recipientTrackers = [];
                        recipientBalances = [];
                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            recipientTrackers[i] = await balance.tracker(RECIPIENTS_3[i]);
                            recipientBalances[i] = await recipientTrackers[i].get();
                        }

                        // Mint and transfer some ERC20 funds to contract
                        erc20Token = await MockERC20.new({from: owner});
                        await erc20Token.transfer(royaltyImplV1.address, ERC20_AMOUNT);

                    });

                    context('drain()', async () => {

                        it('ETH balance of contract drained, recipient balances increased appropriately', async () => {

                            await royaltyImplV1.drain();
                            const contractEndBalance = await contractTracker.get();
                            expect(contractEndBalance).to.be.bignumber.equal("0");

                            // N.B.: All these fugly toString()s required because BigNumber vs BN
                            for (let i = 0; i < recipientTrackers.length; i++) {
                                const singleUnitOfValue = ETH_AMOUNT.div(SCALE_FACTOR);
                                const share = singleUnitOfValue.mul(SPLITS_3[i].toString());
                                const expectedBalance = share.add(recipientBalances[i].toString());
                                const recipientEndBalance = await recipientTrackers[i].get();
                                expect(recipientEndBalance.toString()).to.be.equal(expectedBalance.toString());
                            }

                        });

                        it('ERC20 balance of contract drained, recipient balances increased appropriately', async () => {
                            await royaltyImplV1.drainERC20(erc20Token.address);
                            const endTokenBalance = await erc20Token.balanceOf(royaltyImplV1.address);
                            expect(endTokenBalance).to.be.bignumber.equal("0");

                            for (let i = 0; i < RECIPIENTS_3.length; i++) {
                                const singleUnitOfValue = ERC20_AMOUNT.div(new BN(SCALE_FACTOR));
                                const share = singleUnitOfValue.mul(SPLITS_3[i]);
                                const recipientEndBalance = await erc20Token.balanceOf(RECIPIENTS_3[i]);
                                expect(recipientEndBalance.toString()).to.be.equal(share.toString());
                            }

                        });

                    });

                })

            })

        });

    });

    describe('CollabRoyaltiesRegistry', () => {

        context('addHandler()', async () => {

            it('emits HandlerAdded event on success', async () => {

                const receipt = await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);
                expectEvent(receipt, 'HandlerAdded', {name: FUNDS_HANDLER_V1, handler: royaltyImplV1.address})

            });

        });

        context('once handler added', async () => {

            beforeEach(async () => {

                await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);

                // create edition for for artist 1
                await token.mintBatchEdition(3, artist1, TOKEN_URI, {from: contract});

                // create edition for artist 2
                await token.mintBatchEdition(3, artist2, TOKEN_URI, {from: contract});

            });

            context('setupRoyalty()', async () => {

                it('emits RoyaltySetup event on success', async () => {
                    const receipt = await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});
                    expectEvent(receipt, 'RoyaltySetup', {
                        editionId: EDITION_ID,
                        handlerName: FUNDS_HANDLER_V1,
                        recipients: RECIPIENTS_3,
                        //splits: SPLITS_3
                        // FIXME: throws "expected event argument 'splits' to have value 50000,25000,25000 but got 50000,25000,25000"
                    })
                });

                context('once a royalty has been set up', async () => {

                    beforeEach(async () => {

                        // Get the proxy address with a static call
                        proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                        // Actually deploy the Proxy
                        await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                    });

                    context('hasRoyalties()', async () => {

                        it('false if token id not in edition', async () => {

                            // Check the royalty info for the edition id
                            const hasRoyalties = await royaltyRegistry.hasRoyalties(TOKEN_ID_2);
                            expect(hasRoyalties).to.be.false;

                        })

                        it('true if token id in edition', async () => {

                            // Check the royalty info for the edition id
                            const hasRoyalties = await royaltyRegistry.hasRoyalties(TOKEN_ID);
                            expect(hasRoyalties).to.be.true;

                        })

                    });

                    context('royaltyInfo() with initial edition id', async () => {

                        it('returns proxy address and royalty amount', async () => {

                            // Check the royalty info for the edition id
                            const info = await royaltyRegistry.royaltyInfo(EDITION_ID);
                            expect(info.receiver).to.equal(proxyAddr);
                            expect(info.amount.eq(ROYALTY_AMOUNT)).to.be.true;

                        })

                    });

                    context('reuseRoyaltySetup()', async () => {

                        it('emits RoyaltySetupReused event on success', async () => {

                            // Make sure the proper event was emitted
                            const receipt = await royaltyRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID, {from: contract});
                            expectEvent(receipt, 'RoyaltySetupReused', {
                                editionId: EDITION_ID_2,
                                handler: proxyAddr
                            })
                        });

                        it('appropriate proxy is reused', async () => {

                            // Ensure the same proxy will be reused
                            expect(await royaltyRegistry.reuseRoyaltySetup.call(EDITION_ID_2, EDITION_ID, {from: contract})).to.bignumber.eq(proxyAddr);

                        });

                        context('royaltyInfo() with second edition id', async () => {

                            it('returns proxy address and royalty amount', async () => {

                                // Reuse proxy
                                await royaltyRegistry.reuseRoyaltySetup(EDITION_ID_2, EDITION_ID, {from: contract});

                                // Check the royalty info for the edition id
                                const info = await royaltyRegistry.royaltyInfo(EDITION_ID_2);
                                expect(info.receiver).to.equal(proxyAddr);
                                expect(info.amount.eq(ROYALTY_AMOUNT)).to.be.true;

                            })

                        })

                    });

                });

            });

        });

    });

    describe('Funds Handler Proxy', () => {

        beforeEach(async () => {

            // ------------------------
            // Add handlers to registry
            // ------------------------
            await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);

        });

        context('once deployed and initialized by registry', async () => {

            context('with V1 implementation', async () => {

                beforeEach(async () => {

                    // Get the proxy address with a static call
                    proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                    // Get an ethers contract representation
                    const [deployerAcct] = await ethers.getSigners();
                    royaltyProxy = new ethers.Contract(
                        proxyAddr,
                        royaltyImplV1.abi,
                        deployerAcct
                    );

                });

                context('totalRecipients()', async () => {

                        it('returns the correct number of recipients', async () => {
                            const totalRecipients = await royaltyProxy.totalRecipients();
                            expect(totalRecipients.toString()).to.bignumber.equal(THREE);
                        })

                        it('implementation does *not* know the number of recipients', async () => {
                            const totalRecipients = await royaltyImplV1.totalRecipients();
                            expect(totalRecipients.toString()).to.bignumber.equal(ZERO);
                        })

                    });

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyProxy.royaltyAtIndex(i);
                            expect(royalty.recipient.toString()).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
                        }

                    })

                });

            });

            context('with multiple proxies', async () => {

                beforeEach(async () => {

                    // Get the proxy address with a static call
                    const proxyAddr1 = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3, {from: contract});

                    // Get an ethers contract representation
                    [deployerAcct] = await ethers.getSigners();
                    royaltyProxy = new ethers.Contract(
                        proxyAddr1,
                        royaltyImplV1.abi,
                        deployerAcct
                    );

                    // Get the proxy address with a static call
                    const proxyAddr2 = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_2, SPLITS_2, {from: contract});

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_2, SPLITS_2, {from: contract});

                    // Get an ethers contract representation
                    [deployerAcct] = await ethers.getSigners();
                    royaltyProxy2 = new ethers.Contract(
                        proxyAddr2,
                        royaltyImplV1.abi,
                        deployerAcct
                    );

                });

                context('totalRecipients()', async () => {

                    it('for each proxy, returns the correct number of recipients', async () => {
                        const totalRecipients = await royaltyProxy.totalRecipients();
                        const totalRecipients2 = await royaltyProxy2.totalRecipients();
                        expect(totalRecipients.toString()).to.bignumber.equal(THREE);
                        expect(totalRecipients2.toString()).to.bignumber.equal(TWO);
                    })

                });

                context('royaltyAtIndex()', async () => {

                    it('for each proxy, returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyProxy.royaltyAtIndex(i);
                            expect(royalty.recipient,toString()).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
                        }

                        for (let i = 0; i < RECIPIENTS_2.length; i++) {
                            const royalty = await royaltyProxy2.royaltyAtIndex(i);
                            expect(royalty.recipient,toString()).to.bignumber.equal(RECIPIENTS_2[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_2[i]);
                        }

                    })

                });

            });

        });

    });

});
