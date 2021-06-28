const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const hre = require("hardhat");
const ethers = hre.ethers;
const RoyaltyRegistry = artifacts.require("CloneBasedRegistry");
const RoyaltyImplV1 = artifacts.require('FundsReceiver');
const RoyaltyImplV2   = artifacts.require('FundsSplitter');

contract('Clone-based Royalty Funds Handler Architecture', function (accounts) {

    const [owner, artist1, artist2, artist3 ] = accounts;
    const ZERO = new BN(0);
    const TWO = new BN(2);
    const THREE = new BN(3);
    const HALF = new BN(50000);
    const QUARTER = new BN(25000);
    const EDITION_ID = new BN(12000);
    const ROYALTY_AMOUNT = new BN(125000);
    const RECIPIENTS_3 = [artist1, artist2, artist3];
    const RECIPIENTS_2 = [artist1, artist2];
    const SPLITS_3 = [HALF, QUARTER, QUARTER];
    const SPLITS_2 = [HALF, HALF];
    const FUNDS_HANDLER_V1 = "v1";
    const FUNDS_HANDLER_V2 = "v2";

    let royaltyImplV1, royaltyImplV2,
        royaltyProxy, royaltyProxy2,
        royaltyRegistry, deployer;

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

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V1: Receiver (revision 2)
                    royaltyImplV1 = await RoyaltyImplV1.new(
                        {from: owner}
                    );

                    await royaltyImplV1.init(RECIPIENTS_3, SPLITS_3);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV1.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('shareAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyImplV1.shareAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                        }

                    })

                })

            })

        });

        context('RoyaltyImplV2: Funds Splitter Implementation', async () => {

            it('can be deployed', async () => {

                // Royalty Funds Handler V2: Splitter
                await RoyaltyImplV2.new(
                    {from: owner}
                );

            })

            context('init()', async () => {

                it('can be initialized', async () => {

                    // Royalty Funds Handler V1: Receiver (revision 1)
                    royaltyImplV2 = await RoyaltyImplV2.new(
                        {from: owner}
                    );

                    await royaltyImplV2.init(RECIPIENTS_3, SPLITS_3);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V2: Splitter
                    royaltyImplV2 = await RoyaltyImplV2.new(
                        {from: owner}
                    );

                    await royaltyImplV2.init(RECIPIENTS_3, SPLITS_3);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV2.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('shareAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyImplV2.shareAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                        }

                    })

                })

            })

        });

    });

    describe('RoyaltyRegistry', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver
            royaltyImplV1 = await RoyaltyImplV1.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );

            // -----------------------
            // Create royalty registry
            // -----------------------
            royaltyRegistry = await RoyaltyRegistry.new();

        });

        context('addHandler()', async () => {

            it('emits HandlerAdded event on success', async () => {

                const receipt = await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);
                expectEvent(receipt, 'HandlerAdded', {name: FUNDS_HANDLER_V1, handler: royaltyImplV1.address})

            });

        });

        context('once V1 and V2 handlers added', async () => {

            beforeEach(async () => {

                await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);
                await royaltyRegistry.addHandler(FUNDS_HANDLER_V2, royaltyImplV2.address);

            });

            context('setupRoyalty() with V1', async () => {

                it('emits ProxyDeployed event on success', async () => {
                    const receipt = await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3);
                    expectEvent(receipt, 'ProxyDeployed', {
                        editionId: EDITION_ID,
                        handlerName: FUNDS_HANDLER_V1,
                        recipients: RECIPIENTS_3,
                        //splits: SPLITS_3
                        // FIXME: throws "expected event argument 'splits' to have value 50000,25000,25000 but got 50000,25000,25000"
                    })
                });

                context('royaltyInfo()', async () => {

                    it('given edition id, returns proxy address and royalty amount', async () => {

                        // Get the proxy address with a static call
                        const proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3);

                        // Actually deploy the Proxy
                        await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3);

                        // Check the royalty info for the edition id
                        const info = await royaltyRegistry.royaltyInfo(EDITION_ID);
                        expect(info.receiver).to.equal(proxyAddr);
                        expect(info.amount.eq(ROYALTY_AMOUNT)).to.be.true;

                    })

                })

            })

            context('setupRoyalty() with V2', async () => {

                it('emits ProxyDeployed event on success', async () => {
                    const receipt = await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);
                    expectEvent(receipt, 'ProxyDeployed', {
                        editionId: EDITION_ID,
                        handlerName: FUNDS_HANDLER_V2,
                        recipients: RECIPIENTS_2,
                        //splits: SPLITS_2
                        // FIXME: throws "expected event argument 'splits' to have value 50000,50000 but got 50000,50000"
                    })
                });

                context('royaltyInfo()', async () => {

                    it('given edition id, returns proxy address and royalty amount', async () => {

                        // Get the proxy address with a static call
                        const proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);

                        // Actually deploy the Proxy
                        await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);

                        // Check the royalty info for the edition id
                        const info = await royaltyRegistry.royaltyInfo(EDITION_ID);
                        expect(info.receiver).to.equal(proxyAddr);
                        expect(info.amount.eq(ROYALTY_AMOUNT)).to.be.true;

                    })

                })

            })

        })

    });

    describe('Minimal Proxy', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver
            royaltyImplV1= await RoyaltyImplV1.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );

            // -----------------------
            // Create royalty registry
            // -----------------------
            royaltyRegistry = await RoyaltyRegistry.new();

            // -----------------------
            // Create royalty registry
            // -----------------------
            await royaltyRegistry.addHandler(FUNDS_HANDLER_V1, royaltyImplV1.address);
            await royaltyRegistry.addHandler(FUNDS_HANDLER_V2, royaltyImplV2.address);

        });

        context('once deployed and initialized by RoyaltyRegistry', async () => {

            context('with V1 implementation', async () => {

                beforeEach(async () => {

                    // Get the proxy address with a static call
                    const proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3);

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V1, RECIPIENTS_3, SPLITS_3);

                    // Get an ethers contract representation
                    [deployer] = await ethers.getSigners();
                    royaltyProxy = new ethers.Contract(
                        proxyAddr,
                        royaltyImplV1.abi,
                        deployer
                    );

                });

                context('totalRecipients()', async () => {

                        it('returns the correct number of recipients', async () => {
                            const totalRecipients = await royaltyProxy.totalRecipients();
                            expect(totalRecipients.toString()).to.bignumber.equal(THREE);
                        })

                        it('implementation does *not* know the number of recipients', async () => {
                            const totalRecipients = await royaltyImplV2.totalRecipients();
                            expect(totalRecipients.toString()).to.bignumber.equal(ZERO);
                        })

                    });

                context('shareAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyProxy.shareAtIndex(i);
                            expect(royalty.recipient.toString()).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
                        }

                    })

                });

            })

            context('with V2 implementation', async () => {

                beforeEach(async () => {

                    // Get the proxy address with a static call
                    const proxyAddr = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);

                    // Get an ethers contract representation
                    [deployer] = await ethers.getSigners();
                    royaltyProxy = new ethers.Contract(
                        proxyAddr,
                        royaltyImplV2.abi,
                        deployer
                    );

                });

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        const totalRecipients = await royaltyProxy.totalRecipients();
                        expect(totalRecipients.toString()).to.bignumber.equal(TWO);
                    })

                    it('implementation does *not* know the number of recipients', async () => {
                        const totalRecipients = await royaltyImplV2.totalRecipients();
                        expect(totalRecipients.toString()).to.bignumber.equal(ZERO);
                    })

                });

                context('shareAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_2.length; i++) {
                            const royalty = await royaltyProxy.shareAtIndex(i);
                            expect(royalty.recipient,toString()).to.bignumber.equal(RECIPIENTS_2[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_2[i]);

                        }

                    })

                });

            })

            context('with multiple proxies', async () => {

                beforeEach(async () => {

                    // Get the proxy address with a static call
                    const proxyAddr1 = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                    // Get an ethers contract representation
                    [deployer] = await ethers.getSigners();
                    royaltyProxy = new ethers.Contract(
                        proxyAddr1,
                        royaltyImplV2.abi,
                        deployer
                    );

                    // Get the proxy address with a static call
                    const proxyAddr2 = await royaltyRegistry.setupRoyalty.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                    // Actually deploy the Proxy
                    await royaltyRegistry.setupRoyalty(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_2, SPLITS_2);

                    // Get an ethers contract representation
                    [deployer] = await ethers.getSigners();
                    royaltyProxy2 = new ethers.Contract(
                        proxyAddr2,
                        royaltyImplV2.abi,
                        deployer
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

                context('shareAtIndex()', async () => {

                    it('for each proxy, returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyProxy.shareAtIndex(i);
                            expect(royalty.recipient,toString()).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_3[i]);
                        }

                        for (let i = 0; i < RECIPIENTS_2.length; i++) {
                            const royalty = await royaltyProxy2.shareAtIndex(i);
                            expect(royalty.recipient,toString()).to.bignumber.equal(RECIPIENTS_2[i]);
                            expect(royalty.split.toString()).to.bignumber.equal(SPLITS_2[i]);
                        }

                    })

                });

            })

        })

    });

});
