var jwt = require('jsonwebtoken');
const ethers = require('ethers');

const config = require('../config')
const BaseController = require('./BaseController');
const Admin = require("../models/admin.model");
const Token = require("../models/token.model");
const Item = require("../models/item.model");
const User = require("../models/user.model");
const Sold = require("../models/sold.model");
const Report = require("../models/report.model");
const Subscribe = require("../models/subscribe.model");
const ItemCollection = require("../models/collection.model");
const Claim = require("../models/claim.model")
const LootBox = require("../models/mysterybox.model");
const Contest = require("../models/hhcontest.model");
const Event=require("../models/event.model")
const HhContestPreviousWinnersList=require("../models/hhcontestpreviouswinnerslist")

const { isAddress } = require('ethers/lib/utils');


 const instructionName={
    MINT:'mint heart heads to enter',
    LISTED:'sell heart heads to enter',
    SOLD:'buy heart heads to enter'
  }

module.exports = BaseController.extend({
    name: 'AdminController',
    // login apis
    login: async function (req, res, next) {
        let { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).send({ error: 'invalid params' })
        }
        try {
            const admin = await Admin.findOne({ email: email });
            if (admin && (password === admin.password)) {

                const token = jwt.sign(
                    {
                        email: admin.email
                    },
                    config.secret,
                    {
                        expiresIn: '43200m', // expireIn 1month
                    }
                );
                return res.send({
                    token,
                    email: admin.email
                });
            } else {
                return res.status(401).send({
                    message: 'Invalid Email or password!',
                });
            }
        } catch (err) {
            return res.status(500).send({
                message: err.message,
            });
        }
    },

    loginFromWallet: async function (req, res, next) {
        let { signData, account, timestamp } = req.body;

        try {
            const recoverWallet = ethers.utils.verifyMessage(ethers.utils.arrayify(ethers.utils.hashMessage(`${account}-${timestamp}`)), signData);
            if (recoverWallet.toLowerCase() != account.toLowerCase()) {
                return res.status(401).send({
                    message: 'Signature is invalid',
                });
            }

            if (Date.now() / 1000 >= parseInt(timestamp) + 300) {
                return res.status(401).send({
                    message: 'Request expired',
                });
            }

            let isAdmin = false;
            for (let i = 0; i < config.adminAddresses.length; i++) {
                if (config.adminAddresses[i].toLowerCase() === account.toLowerCase()) {
                    isAdmin = true;
                    break;
                }
            }

            if (isAdmin === false) {
                return res.status(401).send({
                    message: 'Invalid admin verification',
                });
            }

            const token = jwt.sign(
                {
                    account: account
                },
                config.secret,
                {
                    expiresIn: '43200m', // expireIn 1month
                }
            );
            return res.send({
                token,
                account: account
            });

        } catch (err) {
            return res.status(500).send({
                message: err.message,
            });
        }
    },

    getClaims: async function (req, res, next) {
        var searchQuery = {};
        const limit = req.body.limit ? Math.min(parseInt(req.body.limit), 60) : 36;
        const page = req.body.page && parseInt(req.body.page) ? parseInt(req.body.page) : 1;
        let skip = (page - 1) * limit;

        let sortDir = req.body.sortDir === "asc" || req.body.sortDir === "desc" ? req.body.sortDir : "desc";
        if (sortDir === "asc") {
            sortDir = 1;
        } else if (sortDir === "desc") {
            sortDir = -1;
        }

        sort = { timestamp: sortDir };

        const searchTxt = req.body.searchTxt;
        delete req.body.searchTxt;
        if (searchTxt) {
            searchQuery = { $text: { $search: searchTxt } };
        }
        Claim.find(searchQuery, { __v: 0, _id: 0 })
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .lean()
            .exec(async function (err, claims) {
                if (err) return res.status(200).send({ status: false, message: err.message });
                if (!claims) return res.status(200).send({ status: false, message: "No Claims found" });
                
                let addresses = [];
                for (let index = 0; index < claims.length; index++) {
                    const claim = claim[index];
                    addresses.push(claim.from);
                }
                const users = await User.find({ address: { $in: addresses } });

                let ret = [];
                for (let index = 0; index < claims.length; index++) {
                    let claim = claims[index];
                    let fromUsers = users.filter(user => user.address === claim.from);         
                    
                    if (fromUsers && fromUsers.length > 0) {
                        claim.fromUser = fromUsers[0];
                    } else {
                        let ensName = ""
                        if (isAddress(claim.from)) {
                            const provider = new ethers.providers.JsonRpcProvider(config.mainnet_public_rpc_node);
                            ensName = await provider.lookupAddress(claim.from)
                        }                       
                        claim.fromUser = {
                            address: claim.from,
                            ensName: ensName || "",
                            name: "NoName",
                            originalLogo: "https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
                            nonce: Math.floor(Math.random() * 1000000)
                        };
                    } 
                    ret.push(claim)
                }

                Claim.countDocuments(searchQuery, function (err2, count) {
                    if (err2) return res.status(200).send({ status: false, message: err2.message });
                    res.status(200).send({ status: true, claims: ret, count: count });
                });
            });
    },


    // overview api
    getOverview: async function (req, res, next) {
        // get coin price
        let token = await Token.findOne({ address: '0x0000000000000000000000000000000000000000' });

        // get total volume 
        const totalVolumeQuery = [
            {
                $group: {
                    _id: null,
                    tradingVolume: {
                        $sum: '$usdVolume'
                    }
                }
            }
        ];
        let tradingVolume = 0;
        const tradingVolumeInfos = await Sold.aggregate(totalVolumeQuery);
        if (tradingVolumeInfos && tradingVolumeInfos?.length > 0) {
            tradingVolume = tradingVolumeInfos[0].tradingVolume;
        }

        // get total collection       
        let collectionCount = await ItemCollection.countDocuments({});

        // get total items       
        let itemCount = await Item.countDocuments({});

        // get total users        
        let userCount = await User.countDocuments({});


        res.status(200).send({
            status: true,
            overview: {
                collectionCount: collectionCount,
                itemCount: itemCount,
                userCount: userCount,
                tradingVolume: tradingVolume,
                coinPrice: token.rate
            }
        });
    },


    // lootbox apis
    getLootBoxes: async function (req, res, next) {
        var searchQuery = {};

        const limit = req.body.limit ? Math.min(parseInt(req.body.limit), 60) : 36;
        const page = req.body.page && parseInt(req.body.page) ? parseInt(req.body.page) : 1;
        let skip = (page - 1) * limit;

        let sortDir = req.body.sortDir === "asc" || req.body.sortDir === "desc" ? req.body.sortDir : "desc";
        if (sortDir === "asc") {
            sortDir = 1;
        } else if (sortDir === "desc") {
            sortDir = -1;
        }

        sort = { timestamp: sortDir };

        const searchTxt = req.body.searchTxt;
        delete req.body.searchTxt;
        if (searchTxt) {
            searchQuery = { $text: { $search: searchTxt } };
        }

        LootBox.find(searchQuery, { __v: 0, _id: 0 })
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .lean()
            .exec(async function (err, lootboxes) {
                if (err) return res.status(200).send({ status: false, message: err.message });
                if (!lootboxes) return res.status(200).send({ status: false, message: "No LootBox found" });
                let ret = [];
                let addresses = [];
                for (let index = 0; index < lootboxes.length; index++) {
                    const lootbox = lootboxes[index];
                    addresses.push(lootbox.owner);
                }
                let users = await User.find({ address: { $in: addresses } });

                for (let index = 0; index < lootboxes.length; index++) {
                    let lootbox = lootboxes[index];

                    let ownerUsers = users.filter(user => user.address === lootbox.owner);
                    if (ownerUsers && ownerUsers.length > 0) {
                        lootbox.ownerUser = ownerUsers[0];
                    } else {
                        let ensName = ""
                        if (isAddress(lootbox.owner)) {
                            const provider = new ethers.providers.JsonRpcProvider(config.mainnet_public_rpc_node);
                            ensName = await provider.lookupAddress(lootbox.owner)
                        }  
                        lootbox.ownerUser = {
                            address: lootbox.owner,
                            ensName: ensName || "",
                            name: "NoName",
                            originalLogo: "https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67"
                        };
                    }
                    if (lootbox.visible === undefined) lootbox.visible = true
                    ret.push(lootbox)
                }

                LootBox.countDocuments(req.query, function (err2, count) {
                    if (err2) return res.status(200).send({ status: false, message: err2.message });
                    res.status(200).send({ status: true, lootboxes: ret, count: count });
                });
            });
    },

    updateLootBox: async function (req, res, next) {
        if (!req.body.address) return res.status(200).send({ status: false, message: "Missing LootBox Address" });
        const { address, visible } = req.body

        const lootbox = await LootBox.findOne({ address: address.toLowerCase() })
        if (lootbox) {
            lootbox.visible = visible;
            await lootbox.save();
            return res.status(200).send({ status: true, lootbox: lootbox });
        } else {
            return res.status(200).send({ status: false, message: "lootbox is not existed" });
        }
    },


    // collection apis
    getCollections: async function (req, res, next) {        
        var searchQuery = {};

        if (req.body.isFeatured) {
            searchQuery.isFeatured = req.body.isFeatured === 'true'
        }
        const limit = req.body.limit ? Math.min(parseInt(req.body.limit), 60) : 36;
        const page = req.body.page && parseInt(req.body.page) ? parseInt(req.body.page) : 1;
        let skip = (page - 1) * limit;

        let sortDir = req.body.sortDir === "asc" || req.body.sortDir === "desc" ? req.body.sortDir : "desc";
        if (sortDir === "asc") {
            sortDir = 1;
        } else if (sortDir === "desc") {
            sortDir = -1;
        }

        sort = { timestamp: sortDir };

        const searchTxt = req.body.searchTxt;
        delete req.body.searchTxt;
        if (searchTxt) {
            searchQuery = {
                $and: [
                    searchQuery,
                    { $text: { $search: searchTxt } }
                ]
            };
        }
        ItemCollection.find(searchQuery, { __v: 0, _id: 0 })
            .sort(sort)
            .limit(limit)
            .skip(skip)
            .lean()
            .exec(async function (err, collections) {
                if (err) return res.status(200).send({ status: false, message: err.message });
                if (!collections) return res.status(200).send({ status: false, message: "No collections found" });
                let ret = [];

                let addresses = [];
                for (let index = 0; index < collections.length; index++) {
                    const collection = collections[index];
                    addresses.push(collection.ownerAddress);
                }
                let users = await User.find({ address: { $in: addresses } });

                for (let index = 0; index < collections.length; index++) {
                    let collection = collections[index];
                    let ownerUsers = users.filter(user => user.address === collection.ownerAddress);
                    if (ownerUsers && ownerUsers.length > 0) {
                        collection.ownerUser = ownerUsers[0];
                    } else {
                        let ensName = ""
                        if (isAddress(collection.ownerUser)) {
                            const provider = new ethers.providers.JsonRpcProvider(config.mainnet_public_rpc_node);
                            ensName = await provider.lookupAddress(collection.ownerUser)
                        } 
                        collection.ownerUser = {
                            address: collection.ownerAddress,
                            ensName: ensName || "",
                            name: "NoName",
                            originalLogo: "https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67"
                        };
                    }
                    let reportCount = await Report.countDocuments({ itemCollection: collection.address });
                    collection.reportsCount = reportCount;

                    if (collection.reviewStatus == 3) {
                        const subscribe = await Subscribe.findOne({ itemCollection: collection.address });
                        if (subscribe?.expireDate > Date.now() / 1000) {
                            collection.reviewStatus == 4;
                        }
                    }

                    ret.push(collection)
                }
                ItemCollection.countDocuments(searchQuery, function (err2, count) {
                    if (err2) return res.status(200).send({ status: false, message: err2.message });
                    res.status(200).send({ status: true, collections: ret, count: count });
                });
            });
    },

    getCollectionDetail: async function (req, res, next) {
        if (!req.body.address) return res.status(200).send({ status: false, message: "missing collection address" });

        const collectionAddress = req.body.address.toLowerCase();

        ItemCollection.findOne({ address: collectionAddress }, { __v: 0, _id: 0 }).lean().exec(
            async (err, collection) => {
                if (err) return res.status(200).send({ status: false, message: err.message });
                if (!collection) return res.status(200).send({ status: false, message: "No collections found" })
                var owner = await User.findOne({ address: collection.ownerAddress }, { _id: 0, __v: 0 }).lean();
                if (!owner) {
                    collection.ownerUser = {
                        address: collection.ownerAddress.toLowerCase(),
                        name: "NoName",
                        originalLogo: "https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
                        nonce: Math.floor(Math.random() * 1000000)
                    };
                } else {
                    collection.ownerUser = owner;
                }

                // floor price    
                let floorPrice = 0.0;
                if (collection.tradingCount && collection.tradingCount > 0) {
                    floorPrice = collection.tradingVolume / collection.tradingCount;
                }

                let token = await Token.findOne({ address: '0x0000000000000000000000000000000000000000' });

                const summary = {
                    itemCount: collection.totalItemCount || 0,
                    totalVolume: collection.tradingVolume || 0,
                    floorPrice: floorPrice,
                    totalOwners: collection.totalOwners || 0,
                    coinPrice: token.rate
                }

                const reports = await Report.find({ itemCollection: collection.address }).sort({ timestamp: -1 }).limit(100);
                const subscribe = await Subscribe.findOne({ itemCollection: collection.address });

                collection.summary = summary;
                collection.reports = reports;
                collection.subscribe = subscribe;

                res.status(200).send({ status: true, collection: collection })
            });
    },

    updateWhitelist: async function (req, res, next) {
        if (!req.body.address) return res.status(200).send({ status: false, message: "missing collection address" });

        const collectionAddress = req.body.address.toLowerCase();

        const whitelist = req.body.whitelist ? JSON.parse(req.body.whitelist) : [];

        var collectionEntity = await ItemCollection.findOne({ address: collectionAddress });
        if (collectionEntity) {
            const lowers = whitelist.map(address => {
                return address.trim().toLowerCase();
            })
            collectionEntity.whitelist = lowers;

            await collectionEntity.save();

            return res.status(200).send({ status: true, collection: collectionEntity });
        } else {
            return res.status(200).send({ status: false, message: "collection is not existed" });
        }
    },

    confirmVerify: async function (req, res, next) {
        if (!req.body.address) return res.status(200).send({ status: false, message: "Missing Collection Address" });

        const collectionAddress = req.body.address.toLowerCase();

        const collectionEntity = await ItemCollection.findOne({ address: collectionAddress });
        if (collectionEntity) {
            if (collectionEntity.reviewStatus !== 1)
                return res.status(200).send({ status: false, message: "The collection status is not under review." });
            collectionEntity.reviewStatus = 2;

            await collectionEntity.save();

            return res.status(200).send({ status: true, collection: collectionEntity });
        } else {
            return res.status(200).send({ status: false, message: "collection is not existed" });
        }
    },

    setVisible: async function (req, res, next) {
        if (!req.body.address) return res.status(200).send({ status: false, message: "Missing Collection Address" });

        const collectionAddress = req.body.address.toLowerCase();
        const visible = req.body.visible;

        const collectionEntity = await ItemCollection.findOne({ address: collectionAddress });
        if (collectionEntity) {
            collectionEntity.visibility = visible;
            await collectionEntity.save();

            await Item.updateMany({ itemCollection: collectionAddress }, {
                visibility: visible
            });

            return res.status(200).send({ status: true, collection: collectionEntity });
        } else {
            return res.status(200).send({ status: false, message: "collection is not existed" });
        }
    },

    updateCollection: async function (req, res, next) {
        if (!req.body.collection) return res.status(200).send({ status: false, message: "No collection address" })

        const collectionAddress = req.body.collection.toLowerCase();

        const website = req.body.website || ""
        const telegram = req.body.telegram || ""
        const discord = req.body.discord || ""
        const twitter = req.body.twitter || ""
        const facebook = req.body.facebook || ""
        const instagram = req.body.instagram || ""

        const name = req.body.name || ""
        const description = req.body.description || ""

        let originalLogo = ""
        if (req.files["originals"] && req.files["originals"][0]) originalLogo = req.files["originals"][0]?.location
        if (req.body.image) originalLogo = req.body.image

        let lowLogo = ""
        if (req.files["lows"] && req.files["lows"][0]) lowLogo = req.files["lows"][0]?.location
        if (req.body.lowLogo) lowLogo = req.body.lowLogo

        let mediumLogo = ""
        if (req.files["mediums"] && req.files["mediums"][0]) mediumLogo = req.files["mediums"][0]?.location
        if (req.body.mediumLogo) mediumLogo = req.body.mediumLogo

        let highLogo = ""
        if (req.files["highs"] && req.files["highs"][0]) highLogo = req.files["highs"][0]?.location
        if (req.body.highLogo) highLogo = req.body.highLogo

        let coverUrl = ""
        if (req.files["banners"] && req.files["banners"][0]) coverUrl = req.files["banners"][0]?.location
        if (req.body.coverUrl) coverUrl = req.body.coverUrl

        var royalties = req.body.royalties ? JSON.parse(req.body.royalties) : [];
        royalties = royalties.map(royalty => {
            return {
                address: royalty.address.trim().toLowerCase(),
                percentage: Number(royalty.percentage)
            };
        })

        if (royalties && royalties.length > 0) {
            for (let index = 0; index < royalties.length; index++) {
                const roaylty = royalties[index];
                try {
                    ethers.utils.getAddress(roaylty.address);
                } catch (e) {
                    return res.status(200).send({ status: false, message: "invalid royalty address" });
                }
                if ((Number(roaylty.percentage) > 100) || Number(roaylty.percentage) <= 0) {
                    return res.status(200).send({ status: false, message: "invalid royalty percentage" });
                }
            }
        }

        ItemCollection.findOne({ address: collectionAddress }, async (err, collection) => {
            if (err) return res.status(200).send({ status: false, message: err.message });
            if (!collection) return res.status(200).send({ status: false, message: "Collection not found" });

            if (name && name != undefined) collection.name = name
            if (description && description != undefined) collection.description = description

            collection.image = originalLogo
            collection.lowLogo = lowLogo
            collection.mediumLogo = mediumLogo
            collection.highLogo = highLogo
            collection.coverUrl = coverUrl

            if ((website && website != undefined) || website === "") collection.website = website
            if ((telegram && telegram != undefined) || telegram === "") collection.telegram = telegram
            if ((discord && discord != undefined) || discord === "") collection.discord = discord
            if ((twitter && twitter != undefined) || twitter === "") collection.twitter = twitter
            if ((facebook && facebook != undefined) || facebook === "") collection.facebook = facebook
            if ((instagram && instagram != undefined) || instagram === "") collection.instagram = instagram
            if ((royalties && royalties.length > 0) || royalties === []) collection.royalties = royalties

            await collection.save();
            return res.status(200).send({ status: true, message: 'success' });
        })
    },

    upload_collection_asset: async function (req, res, next) {
        let originalLogo = ""
        if (req.files["originals"] && req.files["originals"][0]) originalLogo = req.files["originals"][0]?.location

        let lowLogo = ""
        if (req.files["lows"] && req.files["lows"][0]) lowLogo = req.files["lows"][0]?.location

        let mediumLogo = ""
        if (req.files["mediums"] && req.files["mediums"][0]) mediumLogo = req.files["mediums"][0]?.location

        let highLogo = ""
        if (req.files["highs"] && req.files["highs"][0]) highLogo = req.files["highs"][0]?.location

        let coverUrl = ""
        if (req.files["banners"] && req.files["banners"][0]) coverUrl = req.files["banners"][0]?.location

        return res.status(200).send({ original: originalLogo, lowLogo: lowLogo, mediumLogo: mediumLogo, highLogo: highLogo, coverUrl: coverUrl })
    },

    updateFeaturedCol: async function (req, res, next) {
        if (!req.body.collection) return res.status(200).send({ status: false, message: "No collection address" })

        const collectionAddress = req.body.collection.toLowerCase();

        let bgUrl = ""
        if (req.files["bg"] && req.files["bg"][0]) bgUrl = req.files["bg"][0]?.location
        if (req.body.bgUrl) bgUrl = req.body.bgUrl

        let logoUrl = ""
        let logoType = ""
        if (req.files["logo"] && req.files["logo"][0]) {
            logoUrl = req.files["logo"][0]?.location
            logoType = req.files["logo"][0]?.mimetype.split("/")[0]
        }
        if (req.body.logoUrl) {
            logoUrl = req.body.logoUrl
            logoType = req.body.logoType
        }

        ItemCollection.findOne({ address: collectionAddress }, async (err, collection) => {
            if (err) return res.status(200).send({ status: false, message: err.message });
            if (!collection) return res.status(200).send({ status: false, message: "Collection not found" });
            console.log(collection)
            collection.bgUrl = bgUrl
            collection.logoUrl = logoUrl
            collection.logoType = logoType
            collection.isFeatured = req.body.isFeatured

            await collection.save();
            return res.status(200).send({ status: true, message: 'success', collection: collection });
        })
    },

    // heart head contest create


  
    // create
    contestCreate:async function (req,res,next){
        try {
            const { instructions, startdate, enddate, winningprice,number_of_winners } = req.body;
            let prize_image = req.file ? req.file.location : null;
            //  prize_image = req.body.image
            let start=new Date(startdate).getTime()/1000
            let end=new Date(enddate).getTime()/1000
           
            // Create a new contest document
            const newContest = new Contest({
                instructions,
                startdate: start,
                enddate: end,
                winningprice,
                timestamp:Math.floor((new Date().getTime()/1000)),
                prize_image,
                number_of_winners
            });
    
            const result = await newContest.save();
    
            res.status(201).json({
                success: true,
                message: 'Contest created successfully',
                contest: result
            });
        } catch (error) {
            // Handle errors
            console.error('Error creating contest:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating contest',
                error: error.message
            });
        }
    
    },
 
    // update
    editContest:async function(req,res,next){
        try {
            const {id} = req.params; // Assuming contestId is passed in the URL params
            const { instructions, startdate, enddate,winningprice,prize_image,number_of_winners,newWinner,entries,removeWinnerAccount} = req.body;
            let prizeImage = req.file ? req.file.location : prize_image;
            if(!id) return res.status(404).json({res:'contest id is require!'})
            
            let start=new Date(startdate).getTime()/1000
            let end=new Date(enddate).getTime()/1000
            // Find the contest by its ID and update its details

            let update = {
                $set: {
                    instructions,
                    startdate: start,
                    enddate: end,
                    winningprice,
                    prize_image: prizeImage,
                    number_of_winners
                }
            };


            // Check if there's a new winner to add
            if (newWinner) {
                update.$push = { winners: newWinner,entries:entries }; // Push new winner to winners array
            }

             // Remove a winner by account if provided
             if (removeWinnerAccount && removeWinnerAccount.account) {
                update.$pull = { winners: { account: removeWinnerAccount.account } }; // Pull the winner with the specific account
            }

            // Find the contest by its ID and update its details
            const updatedContest = await Contest.findOneAndUpdate(
                { _id: id }, // Find by contestId
                update,
                { new: true } // Return the updated contest
            );
    
    
            res.status(200).json({
                success: true,
                message: 'Contest updated successfully',
                contest: updatedContest
            });
        } catch (error) {
            console.error('Error updating contest:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating contest',
                error: error.message
            });
        }
    },

    // delete
    deleteContest :async function(req, res, next) {
        try {
            const { id } = req.params; // Assuming contestId is passed in the URL params
            if (!id) return res.status(404).json({ res: 'Contest ID is required!' });
    
            // Find the contest by its ID and delete it
            const deletedContest = await Contest.findOneAndDelete({ _id: id });
    
            if (!deletedContest) {
                return res.status(404).json({
                    success: false,
                    message: 'Contest not found'
                });
            }
    
            res.status(200).json({
                success: true,
                message: 'Contest deleted successfully',
                contest: deletedContest
            });
        } catch (error) {
            console.error('Error deleting contest:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting contest',
                error: error.message
            });
        }
    },

    // list
    getContestList: async function(req,res,next){
        try{
			let items;
            let statusCondition
            let statusFilter=req.query.status_type;
            let record;
            let count;
            let totalPage;
            let showpreviousWin = req.query.showpreviouswin // it got previous record
			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;

			let skip = (page - 1) * limitNum;

                    
            switch (statusFilter) {
                case "Active":
                    statusCondition = {
                        $cond: [
                            { $and: [
                                { $gt: [new Date()/1000, "$startdate"] }, 
                                { $lt: [new Date()/1000, "$enddate"] }
                            ]},
                            "Active",
                            "$$REMOVE" // Remove the field if the condition doesn't match
                        ]
                    };
                    break;
                case "Closed":
                    statusCondition = {
                        $cond: [
                            { $gt: [new Date()/1000, "$enddate"] }, 
                            "Closed",
                            "$$REMOVE"
                        ]
                    };
                    break;
                case "Pending":
                    statusCondition = {
                        $cond: [
                            { $lt: [new Date()/1000, "$startdate"] }, 
                            "Pending",
                            "$$REMOVE"
                        ]
                    };
                    break;
                default:
                    statusCondition={
                        $cond: [
                            { $lt: [new Date()/1000, "$startdate"] }, 
                            "Pending",
                            {
                                $cond: [
                                    { $gt: [new Date()/1000, "$enddate"] }, 
                                    "Closed",
                                    "Active"
                                ]
                            }
                        ]
                    }
                    break;
            }

            if(showpreviousWin){

                    const contests = await Contest.find({}); // or any other filter you need
                    // Aggregate winners and include contest details
                    let aggregatedWinners = [];
                    let totalMinted
                    let nameType;

                    for (let i = 0; i < contests.length; i++) {
                        const contest = contests[i];


                        const contestDetails = {
                            _id:contest._id,
                            instructions: contest.instructions,
                            startdate: contest.startdate,
                            enddate: contest.enddate,
                            prize_image: contest.prize_image,
                            winningprice: contest.winningprice,
                        };
                        switch(contest?.instructions){
                            case instructionName.LISTED:
                                nameType='Listed'
                                break;
                            case instructionName.SOLD :
                                nameType='Sold'
                                break;
                            default:        
                        }

                        if(contest?.instructions ===instructionName.MINT){
                            totalMinted = await Item.countDocuments({
                                   itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                                   'attributes.value': 'false',
                                   mintTimestamp: {
                                       $gte: contest.startdate,
                                       $lte: contest.enddate
                                   }
                           });
                        }
                        else{
                            totalMinted=await Event.countDocuments({
                                itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                                name: nameType,
                                timestamp: {
                                    $gte: contest.startdate,
                                   $lte: contest.enddate
                                }
                            })
                        }

                        
                    
                        for (let j = 0; j < contest.winners.length; j++) {
                            const winner = contest.winners[j];
                            aggregatedWinners.push({
                                ...contestDetails, // Spread contest details into each winner record
                                winnerId: winner._id,
                                account: winner.account,
                                entries: winner.entries,
                                totalMinted: totalMinted
                            });
                        }
                    }

                    aggregatedWinners.sort((a, b) => b.entries - a.entries);

                    
                  count =aggregatedWinners?.length
                  record=aggregatedWinners?.slice(skip,  skip + limitNum)
                  totalPage=Math?.ceil(count/limitNum)
                  res.send({
                      count,
                      record,
                      totalPage
                      
                  })
    
                
            }else{
                items = await Contest.aggregate([
                    {
                        $facet: {
                            data: [
                                {
                                    $addFields: {
                                        status:statusCondition
                                    }
                                },
                                {
                                    $match: {
                                        status: { $exists: true } // Filter out documents where status was removed
                                    }
                                },
                                {
                                    $project: {
                                        instructions: 1,
                                        startdate: 1,
                                        enddate: 1,
                                        winningprice:1,
                                        status: 1,  // Include the status field in the projection
                                        prize_image:1,
                                        number_of_winners:1,
                                        winners:1,
                                        timestamp:1
                                    }
                                },
                                {
                                    $sort:{
                                        timestamp:-1
                                    }
                                },
                                { $skip: skip },
                                { $limit: limitNum }
                            ],
                            totalCount: [
                                {
                                    $addFields: {
                                        status: statusCondition // Apply the same statusCondition here
                                    }
                                },
                                {
                                    $match: {
                                        status: { $exists: true } // This ensures only documents that match the statusCondition are counted
                                    }
                                },
                                { $count: "count" }
                            ]
                        }
                    }
                ]);

                record=items[0]?.data;
                count=items[0].totalCount[0].count;
                totalPage=Math.ceil(count/limitNum)

                res.send({
                    count,
                    record,
                    totalPage
                    
                })
                
            }

		}catch(error){
			res.status(500).json({ message: "Internal server error" });
		}
    },

    // winner list
    getContestWinnerList:async function(req,res,next){
        try {
            const {id} = req.params;
           let nameType;
           let TotalItemEntries;

            let limitNum = req.query.limit
                    ? parseInt(req.query.limit)
                    : 12;
                const page =
                    req.query.page && parseInt(req.query.page)
                        ? parseInt(req.query.page)
                        : 1;
    
                let skip = (page - 1) * limitNum;

            const contest = await Contest.findById(id);

            if (!contest) {
                return res.status(404).json({res: 'Contest not found'});
            }
            const {_id,startdate,enddate,instructions,winningprice,winners,number_of_winners,prize_image}=contest
            // instruction  three type
            // 1.mint heart heads to enter == Minted
            // 2.sell heart-heads to enter  ==  type event name: Listed
            // 3.buy heart-heads to enter   ==  type event name: Sold

            switch(instructions){
                case instructionName.MINT:
                    nameType='Minted'
                    break;
                case instructionName.LISTED:
                    nameType='Listed'
                    break;
                case instructionName.SOLD :
                    nameType='Sold'
                    break;
                default:        
            }
           

			let items=[];
            let match = [];
            let sell_buy_match=[]
            let matchTotalNft=[]

             
            match = [
				{
					$match: {
						itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
						'attributes.value': 'false',
                        mintTimestamp: {
                            $gte: startdate,
                            $lte: enddate
                        }
					},
				},
			];

            matchTotalNft=[
                {
                    $match: {
                        itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                        'attributes.value': 'false',
                    },
                },
            ]

            sell_buy_match = [
				{
                    $match: {
                        'itemDetails.itemCollection': process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                        'itemDetails.name': nameType,
                        'itemDetails.timestamp': {
                            $gte: startdate,
                            $lte: enddate
                        }
                    },
                },
			];
  
            const totalEntiesmint = {
                itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                'attributes.value': 'false',
                mintTimestamp: {
                    $gte: startdate,
                    $lte: enddate
                }
            };

            const totalEntiesBuySell={
                itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
                    name: nameType,
                    timestamp: {
                        $gte: startdate,
                        $lte: enddate
                    }
            }

            if(instructions === instructionName.MINT){
                
                TotalItemEntries= await Item.countDocuments(totalEntiesmint)
                items= await Item.aggregate([
                    ...match,
                    {
                        $unwind: "$holders" // Unwind the holders array to group by each address
                    },
                    {
                        $group: {
                            _id: "$holders.address", // Group by holders.address
                            count: { $sum: 1 }, // Count the number of items for each address
                            items: { $push: { // Collect all items data per group if needed
                                mintTimestamp: "$mintTimestamp",
                                itemCollection: "$itemCollection",
                                tokenId: "$tokenId",
                                image: "$image",
                                name: "$name",
                                description: "$description",
    
                            }}
                        }
                    },
                    { $sort: { count: -1 } },
    
                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: limitNum },
                                {
                                    $project: {
                                        _id: 0,
                                        count: 1,
                                        address: "$_id",
                                        'items.mintTimestamp': 1,
                                        'items.itemCollection': 1,
                                        'items.tokenId': 1,
                                        'items.image': 1,
                                        'items.name': 1,
                                        'items.description': 1,
                                        'holders.address':1
                                        
                                        
                                    }
                                }
                            ],
                            totalCount: [
                                { $count: "count" }
                            ]
                        }
                    }
    
                ])
                
            }
            if(instructions ===instructionName.LISTED){
              
              // Adjust this based on actual contents
                TotalItemEntries = await Event.countDocuments(totalEntiesBuySell);
                items = await Item.aggregate([
                    ...matchTotalNft,
                    {
                        $unwind: "$holders"
                    },
                    {
                        $group: {
                            _id: "$holders.address",
                            totalNFTs: { $sum: 1 },
                            itemCollections: { $addToSet: "$itemCollection" }
                        }
                    },
                    {
                        $lookup: {
                            from: "events",
                            let: { address: "$_id", collections: "$itemCollections" },
                            pipeline: [
                                { $match: 
                                    { $expr: 
                                        { $and: [
                                            { $in: ["$itemCollection", "$$collections"] },
                                            { $eq: ["$from", "$$address"] }
                                        ]}
                                    }
                                }
                            ],
                            as: "itemDetails"
                        }
                    },
                    {
                        $unwind: {
                            path: "$itemDetails",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    ...sell_buy_match,
                    {
                        $group: {
                            _id: "$_id",
                            count: { $sum: 1 },
                            totalNFTs: { $first: "$totalNFTs" },
                            items: { $push: {
                                name:"$itemDetails.name",
                                tokenId: "$itemDetails.tokenId",
                                tokenAdr: "$itemDetails.tokenAdr",
                                price:"$itemDetails.price",
                                itemCollection:"$itemDetails.itemCollection",
                                from:"$itemDetails.from",
                                to:"$itemDetails.to",
                            }}
                        }
                    },
                    { 
                        $sort: { count: -1 }
                    },
                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: limitNum },
                                {
                                    $project: {
                                        _id: 0,
                                        address: "$_id",
                                        totalNFTs: 1,
                                        count: 1,
                                        'items.name': 1,
                                        'items.tokenId': 1,
                                        'items.tokenAdr': 1,
                                        'items.price': 1,
                                        'items.itemCollection':1,
                                        'items.from':1,
                                        'items.to':1
                                    }
                                }
                            ],
                            totalCount: [
                                { $count: "count" }
                            ]
                        }
                    }
                ]);
                
            }
            if(instructions ===instructionName.SOLD){
               
                TotalItemEntries = await Event.countDocuments(totalEntiesBuySell);
                items = await Item.aggregate([
                    ...matchTotalNft,
                    {
                        $unwind: "$holders"
                    },
                    {
                        $group: {
                            _id: "$holders.address",
                            totalNFTs: { $sum: 1 },
                            itemCollections: { $addToSet: "$itemCollection" }
                        }
                    },
                    {
                        $lookup: {
                            from: "events",
                            let: { address: "$_id", collections: "$itemCollections" },
                            pipeline: [
                                { $match: 
                                    { $expr: 
                                        { $and: [
                                            { $in: ["$itemCollection", "$$collections"] },
                                            { $eq: ["$to", "$$address"] }  // change to for by
                                        ]} 
                                    }
                                }
                            ],
                            as: "itemDetails"
                        }
                    },
                    {
                        $unwind: {
                            path: "$itemDetails",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    ...sell_buy_match,
                    {
                        $group: {
                            _id: "$_id",
                            count: { $sum: 1 },
                            totalNFTs: { $first: "$totalNFTs" },
                            items: { $push: {
                                name:"$itemDetails.name",
                                tokenId: "$itemDetails.tokenId",
                                tokenAdr: "$itemDetails.tokenAdr",
                                price:"$itemDetails.price",
                                itemCollection:"$itemDetails.itemCollection",
                                from:"$itemDetails.from",
                                to:"$itemDetails.to",
                            }}
                        }
                    },
                    { 
                        $sort: { count: -1 }
                    },
                    {
                        $facet: {
                            data: [
                                { $skip: skip },
                                { $limit: limitNum },
                                {
                                    $project: {
                                        _id: 0,
                                        address: "$_id",
                                        totalNFTs: 1,
                                        count: 1,
                                        'items.name': 1,
                                        'items.tokenId': 1,
                                        'items.tokenAdr': 1,
                                        'items.price': 1,
                                        'items.itemCollection':1,
                                        'items.from':1,
                                        'items.to':1
                                    }
                                }
                            ],
                            totalCount: [
                                { $count: "count" }
                            ]
                        }
                    }
                ]);

            }
            let record=items[0]?.data || [];
            let count=items[0]?.totalCount[0]?.count || 0;
            let totalPage=Math.ceil(count/limitNum) || 0

         
            res.status(200).json({
                _id,
                instructions,
                winners,
                startdate,
                enddate,
                winningprice,
                prize_image,
                number_of_winners,
                TotalItemEntries,
                count,
                record,
                totalPage,
            });
        } catch (error) {
            console.log('error', error)
			res.status(500).json({ message: "Internal server error" });
          
        }

    },
    
    // // adding create Selecting winners api 
    // selectWinners:async function (req,res,next){
    //     try {
    //         const {account, instructions, startdate, enddate, winningprize } = req.body;
    //        let check= await HhContestPreviousWinnersList.findOne({ account: account })
    //        if(check) return res.status(200).json({
    //         selected: true,
    //         message: 'User select already!!',
    //         });
    //         // Create a new contest document
    //         const newContestPreviousWin = new HhContestPreviousWinnersList({
    //             account:account.toLowerCase(),
    //             instructions,
    //             startdate: startdate,
    //             enddate: enddate,
    //             winningprize,
    //             timestamp:Math.floor((new Date().getTime()/1000)),
    //         });
    
    //         const result = await newContestPreviousWin.save();
    
    //         res.status(201).json({
    //             success: true,
    //             message: 'Select winner successfully',
    //             contest: result
    //         });
    //     } catch (error) {
    //         // Handle errors
    //         console.error('Error Select winner:', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Select winner',
    //             error: error.message
    //         });
    //     }
    
    // },

    // // update selecting winners 
    // selectWinnersUpdate:async function(req,res,next){
    //     try {
    //         const {account} = req.params; // Assuming contestId is passed in the URL params
    //         const { instructions, startdate, enddate,winningprize} = req.body;
    //         if(!account) return res.status(404).json({res:'contest account is require!'})
    //         // Find the contest by its ID and update its details
    //         const updatedSelectWinner = await HhContestPreviousWinnersList.findOneAndUpdate(
    //             { account:account }, // Find by contestId
    //             {
    //                 $set: {
    //                     instructions,
    //                     startdate,
    //                     enddate,
    //                     winningprize,
    //                 }
    //             },
    //             { new: true } // Return the updated contest
    //         );
    
    //         res.status(200).json({
    //             success: true,
    //             message: 'Updated SelectWinner successfully',
    //             contest: updatedSelectWinner
    //         });
    //     } catch (error) {
    //         console.error('Updated SelectWinner:', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Updated SelectWinner',
    //             error: error.message
    //         });
    //     }
    // },

    // // remove / delete selecting winners 
    // deleteselectWinners :async function(req, res, next) {
    //     try {
    //         const { account } = req.params; // Assuming contestId is passed in the URL params
    //         if (!account) return res.status(404).json({ res: 'Selected winner account is required!' });
    
    //         // Find the contest by its account and delete it
    //         const deletedSelectedWinners = await HhContestPreviousWinnersList.findOneAndDelete({ account: account });
    
    //         if (!deletedSelectedWinners) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'selected winners not found'
    //             });
    //         }
    
    //         res.status(200).json({
    //             success: true,
    //             message: 'Selected winnere remove successfully',
    //             contest: deletedSelectedWinners
    //         });
    //     } catch (error) {
    //         console.error('Selected winnere remove :', error);
    //         res.status(500).json({
    //             success: false,
    //             message: 'Selected winnere remove ',
    //             error: error.message
    //         });
    //     }
    // },

    // // Select Previous Winners list
    // getSelectPreviousWinners: async function(req,res,next){
    //     try{
	// 		let items;
			
	// 		let limitNum = req.query.limit
	// 			? Math.min(parseInt(req.query.limit), 60)
	// 			: 12;
	// 		const page =
	// 			req.query.page && parseInt(req.query.page)
	// 				? parseInt(req.query.page)
	// 				: 1;

	// 		let skip = (page - 1) * limitNum;



    //         items = await HhContestPreviousWinnersList.aggregate([
    //             {
    //                 $facet: {
    //                     data: [
                           
    //                         {
    //                             $project: {
    //                                 instructions: 1,
    //                                 startdate: 1,
    //                                 enddate: 1,
    //                                 winningprize:1,
    //                                 timestamp:1
    //                             }
    //                         },
    //                         {
    //                             $sort:{
    //                                 timestamp:-1
    //                             }
    //                         },
    //                         { $skip: skip },
    //                         { $limit: limitNum }
    //                     ],
    //                     totalCount: [
    //                         { $count: "count" }
    //                     ]
    //                 }
    //             }
    //         ]);

    //         let record=items[0]?.data;
    //         let count=items[0].totalCount[0].count;
    //         let totalPage=Math.ceil(count/limitNum)

	// 		res.send({
    //             count,
    //             record,
    //             totalPage
				
	// 		})

	// 	}catch(error){
	// 		res.status(500).json({ message: "Internal server error" });
	// 	}
    // },
});
