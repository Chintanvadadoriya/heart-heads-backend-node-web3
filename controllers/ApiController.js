const mongoose = require("mongoose");
const BaseController = require("./BaseController");
const User = require("../models/user.model");
const config = require('../config')
const ItemCollection = require("../models/collection.model");
const Item = require("../models/item.model");
const Pair = require("../models/pair.model");
const Sold = require("../models/sold.model");
const Auction = require("../models/auction.model");
const Event = require("../models/event.model");
const Bid = require("../models/bid.model");
const Category = require("../models/category.model");
const MysteryBox = require("../models/mysterybox.model");
const Card = require("../models/card.model");
const StakedItem = require("../models/stakeditem.model");
const Staking = require("../models/staking.model");
const Token = require("../models/token.model");
const Gas = require("../models/gas.model");

const Hourstat = require("../models/hourstat.model");
const Daystat = require("../models/daystat.model");
const Weekstat = require("../models/weekstat.model");
const Monthstat = require("../models/monthstat.model");
const Alltimestat = require("../models/alltimestat.model");
const HeartHeadsItem = require('../models/heartheadsitems.model')
const Tokens=require('../constant')
const axios = require("axios");
const FastXmlParser = require("fast-xml-parser");
const VoteBalance = require('../models/votebalance.model'); 
const Proposal = require("../models/proposal.model");
const VoteCast = require("../models/votecast.model");
const { ethers } = require("ethers");
const HhStakingBalance = require("../models/hhstakingbalance.model");
const HhStackers = require("../models/hhstakers.model");
const provider = new ethers.providers.JsonRpcProvider(config.mainnet_public_rpc_node);
// const provider = new ethers.providers.JsonRpcProvider("https://rpc.v4.testnet.pulsechain.com/");
const PLSRare=config?.pulseTokenAddress
const Contest = require("../models/hhcontest.model");

const instructionName={
    MINT:'mint heart heads to enter',
    LISTED:'sell heart heads to enter',
    SOLD:'buy heart heads to enter'
  }
module.exports = BaseController.extend({
	name: "ApiController",

	// get nfts
	getItems: async function (req, res, next) {
		const that = this;
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 12;
		let data = this.handleItemGetRequest(req, limitNum);

		Item.find(data.query, { __v: 0, _id: 0 })
			.sort(data.sort)
			.limit(limitNum)
			.skip(data.skip)
			.lean()
			.exec(async function (err, items) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!items)
					return res
						.status(200)
						.send({ status: false, message: "No Items found" });

				let collectionAddrs = [];
				for (let index = 0; index < items.length; index++) {
					let item = items[index];
					collectionAddrs.push(item.itemCollection);
				}
				let collections = await ItemCollection.find({
					address: { $in: collectionAddrs },
				}).lean();
				let collectionA = [];
				for (let index = 0; index < items.length; index++) {
					let item = items[index];
					// setup collection info
					item.collectionInfo = collections.filter(
						(collection) =>
							collection.address === item.itemCollection
					)[0];

					if (item.itemCollection === process.env.ITEM_COLLECTION_ADDRESS.toLowerCase()) {
						// Check if "trait_type" is "composed" and "value" is "false"
						const composedAttribute = item.attributes.find(attr =>
							attr.trait_type === "composed" && attr.value === "false"
						);

						if (composedAttribute) {
							// Continue processing the item
							collectionA.push(item);
						}
					}

					// setup supply
					var supply = 0;
					for (let index = 0; index < item.holders.length; index++) {
						const holdElement = item.holders[index];
						supply = supply + holdElement.balance;
					}
					item.supply = supply;

					//set up pair information

					const firstPairs = await Pair.find(
						{
							tokenId: item.tokenId,
							itemCollection: item.itemCollection,
						},
						{ _id: 0, __v: 0 }
					)
						.sort({ usdPrice: 1 })
						.limit(1)
						.lean();
					if (firstPairs && firstPairs?.length > 0) {
						item.pairInfo = firstPairs[0];
					}

					//set up auction information
					var auction = await Auction.findOne(
						{
							tokenId: item.tokenId,
							itemCollection: item.itemCollection,
						},
						{ _id: 0, __v: 0 }
					).lean();
					if (auction) {
						auction.price = auction.startPrice;
						item.auctionInfo = auction;
					}
				}
				Item.countDocuments(data.query, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						items: collectionA.length !== 0 ? collectionA : items,
						count: count,
					});
				});
			});
	},

	// home page
	getFeaturedCollections: async function (req, res, next) {
		const collections = await ItemCollection.find(
			{ isFeatured: true },
			{ _id: 0, __v: 0 }
		).lean();
		const hexToysCol = collections.find(
			(_collection) =>
				_collection.address.toLowerCase() ===
				"0xa35a6162eaecddcf571aeaa8edca8d67d815cee4"
		);
		const dexToysCol = collections.find(
			(_collection) =>
				_collection.address.toLowerCase() ===
				"0xf886f928e317cfd4085137a7a755c23d87f81908"
		);
		let ret = [];
		if (hexToysCol) ret.push(hexToysCol);
		for (const collection of collections) {
			if (
				![
					"0xa35a6162eaecddcf571aeaa8edca8d67d815cee4",
					"0xf886f928e317cfd4085137a7a755c23d87f81908",
				].includes(collection.address.toLowerCase())
			) {
				ret.push(collection);
			}
		}
		if (dexToysCol) ret.push(dexToysCol);
		res.status(200).send({
			status: true,
			collections: ret,
			count: collections.length,
		});
	},

	getTopNFTs: async function (req, res, next) {
		const that = this;
		let ret = [];

		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 10;

		const soldQuery = [
			{
				$group: {
					_id: {
						itemCollection: "$itemCollection",
						tokenId: "$tokenId",
					},
					tradingVolume: {
						$sum: "$usdVolume",
					},
					tradingCount: {
						$sum: "$amount",
					},
				},
			},
			{
				$sort: {
					tradingVolume: -1,
				},
			},
			{
				$limit: limitNum,
			},
		];

		const idList = await Sold.aggregate(soldQuery);
		if (idList && idList?.length > 0) {
			let token = await Token.findOne({
				address: "0x0000000000000000000000000000000000000000",
			});

			for (let index = 0; index < idList.length; index++) {
				var ItemId = idList[index];
				var itemCollection = ItemId._id.itemCollection;
				var tokenId = ItemId._id.tokenId;
				const item = await Item.findOne(
					{ tokenId: tokenId, itemCollection: itemCollection },
					{ __v: 0, _id: 0 }
				).lean();

				item.coinPrice = token.rate;
				item.tradingVolume = ItemId.tradingVolume;
				item.tradingCount = ItemId.tradingCount;
				ret.push(item);
			}
		}

		if (ret && ret?.length > 0) {
			res.status(200).send({
				status: true,
				items: ret,
				count: ret?.length,
			});
		} else {
			return res
				.status(200)
				.send({ status: false, message: "No Items found" });
		}
	},

	// home page
	getTop3Collections: async function (req, res, next) {
		Monthstat.find(
			{
				tradingVolume: { $gt: 0 },
			},
			{ __v: 0, _id: 0 }
		)
			.sort({ tradingVolume: -1 })
			.limit(3)
			.lean()
			.exec(async function (err, collections) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				res.status(200).send({
					status: true,
					collections: collections,
				});
			});
	},

	// all time top 3 collection

	getAllTimeTop3Collections: async function (req, res, next) {
		Alltimestat.find(
			{
				tradingVolume: { $gt: 0 },
			},
			{ __v: 0, _id: 0 }
		)
			.sort({ tradingVolume: -1 })
			.limit(3)
			.lean()
			.exec(async function (err, collections) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				res.status(200).send({
					status: true,
					collections: collections,
				});
			});
	},

	// home page
	getTopCollections: async function (req, res, next) {
		let duration = req.query.duration ? req.query.duration : "Day"; // Hour, Day, Week, Month

		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 10;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;

		let token = await Token.findOne({
			address: "0x0000000000000000000000000000000000000000",
		});
		// floor filter
		let floorMin = req.query.floorMin
			? Number(req.query.floorMin) * token.rate
			: 0;
		let floorMax = req.query.floorMax
			? Number(req.query.floorMax) * token.rate
			: 0;
		let floorQuery = {
			tradingVolume: { $gt: 0 },
		};
		if (floorMin > 0) {
			if (floorMax > 0) {
				if (floorMax > floorMin) {
					floorQuery["floorPrice"] = { $gt: floorMin, $lt: floorMax };
				}
			} else {
				floorQuery["floorPrice"] = { $gt: floorMin };
			}
		} else {
			if (floorMax > 0) {
				floorQuery["floorPrice"] = { $lt: floorMax };
			} else {
			}
		}
		switch (duration) {
			case "Hour":
				Hourstat.find(floorQuery, { __v: 0, _id: 0 })
					.sort({ tradingVolume: -1 })
					.limit(limitNum)
					.skip(skip)
					.lean()
					.exec(async function (err, collections) {
						if (err)
							return res
								.status(200)
								.send({ status: false, message: err.message });
						if (!collections)
							return res.status(200).send({
								status: false,
								message: "No Collections found",
							});

						Hourstat.countDocuments(
							floorQuery,
							function (err2, count) {
								if (err2)
									return res.status(200).send({
										status: false,
										message: err2.message,
									});
								res.status(200).send({
									status: true,
									collections: collections,
									count: count,
								});
							}
						);
					});
				break;

			case "Day":
				Daystat.find(floorQuery, { __v: 0, _id: 0 })
					.sort({ tradingVolume: -1 })
					.limit(limitNum)
					.skip(skip)
					.lean()
					.exec(async function (err, collections) {
						if (err)
							return res
								.status(200)
								.send({ status: false, message: err.message });
						if (!collections)
							return res.status(200).send({
								status: false,
								message: "No Collections found",
							});

						Daystat.countDocuments(
							floorQuery,
							function (err2, count) {
								if (err2)
									return res.status(200).send({
										status: false,
										message: err2.message,
									});
								res.status(200).send({
									status: true,
									collections: collections,
									count: count,
								});
							}
						);
					});
				break;

			case "Week":
				Weekstat.find(floorQuery, { __v: 0, _id: 0 })
					.sort({ tradingVolume: -1 })
					.limit(limitNum)
					.skip(skip)
					.lean()
					.exec(async function (err, collections) {
						if (err)
							return res
								.status(200)
								.send({ status: false, message: err.message });
						if (!collections)
							return res.status(200).send({
								status: false,
								message: "No Collections found",
							});

						Weekstat.countDocuments(
							floorQuery,
							function (err2, count) {
								if (err2)
									return res.status(200).send({
										status: false,
										message: err2.message,
									});
								res.status(200).send({
									status: true,
									collections: collections,
									count: count,
								});
							}
						);
					});
				break;

			case "Month":
				Monthstat.find(floorQuery, { __v: 0, _id: 0 })
					.sort({ tradingVolume: -1 })
					.limit(limitNum)
					.skip(skip)
					.lean()
					.exec(async function (err, collections) {
						if (err)
							return res
								.status(200)
								.send({ status: false, message: err.message });
						if (!collections)
							return res.status(200).send({
								status: false,
								message: "No Collections found",
							});

						Monthstat.countDocuments(
							floorQuery,
							function (err2, count) {
								if (err2)
									return res.status(200).send({
										status: false,
										message: err2.message,
									});
								res.status(200).send({
									status: true,
									collections: collections,
									count: count,
								});
							}
						);
					});
				break;

			default:
				Daystat.find(floorQuery, { __v: 0, _id: 0 })
					.sort({ tradingVolume: -1 })
					.limit(limitNum)
					.skip(skip)
					.lean()
					.exec(async function (err, collections) {
						if (err)
							return res
								.status(200)
								.send({ status: false, message: err.message });
						if (!collections)
							return res.status(200).send({
								status: false,
								message: "No Collections found",
							});

						Daystat.countDocuments(
							floorQuery,
							function (err2, count) {
								if (err2)
									return res.status(200).send({
										status: false,
										message: err2.message,
									});
								res.status(200).send({
									status: true,
									collections: collections,
									count: count,
								});
							}
						);
					});
				break;
		}
	},

	// home page
	getRecentlySold: async function (req, res, next) {
		const that = this;
		let ret = [];

		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 10;

		let match = {};
		if (req.query.collection) {
			match = {
				itemCollection: req.query.collection.toLowerCase(),
			};
		}

		const soldQuery = [
			{
				$match: match,
			},
			{
				$group: {
					_id: {
						itemCollection: "$itemCollection",
						tokenId: "$tokenId",
					},
					lastSold: {
						$max: "$timestamp",
					},
				},
			},
			{
				$sort: {
					lastSold: -1,
				},
			},
			{
				$limit: limitNum,
			},
		];

		const idList = await Sold.aggregate(soldQuery);
		if (idList && idList?.length > 0) {
			let collectionAddrs = [];
			let soldIds = [];
			let itemIds = [];
			for (let index = 0; index < idList.length; index++) {
				var ItemId = idList[index];
				var itemCollection = ItemId._id.itemCollection;
				var tokenId = ItemId._id.tokenId;
				var lastSold = ItemId.lastSold;

				collectionAddrs.push(ItemId._id.itemCollection);
				soldIds.push(`${itemCollection}-${tokenId}-${lastSold}`);
				itemIds.push(`${itemCollection}-${tokenId}`);
			}

			let collections = await ItemCollection.find({
				address: { $in: collectionAddrs },
			}).lean();
			let tokens = await Token.find({}).lean();
			let items = await Item.find({ id: { $in: itemIds } }).lean();
			let solds = await Sold.find({ id: { $in: soldIds } }).lean();

			// for (let index = 0; index < idList.length; index++) {
			//   var ItemId = idList[index];
			//   var itemCollection = ItemId._id.itemCollection;
			//   var tokenId = ItemId._id.tokenId;
			//   var lastSold = ItemId.lastSold;

			//   let itemEntity = items.filter(item => item.id === `${itemCollection}-${tokenId}`)[0];
			//   let soldInfo = solds.filter(sold => sold.id === `${itemCollection}-${tokenId}-${lastSold}`)[0];

			//   soldInfo.tokenInfo = tokens.filter(token => token.address === soldInfo.tokenAdr)[0];
			//   itemEntity.soldInfo = soldInfo;
			//   itemEntity.collectionInfo = collections.filter(collection => collection.address === itemCollection)[0];
			//   ret.push(itemEntity)
			// }
		}

		if (ret && ret?.length > 0) {
			res.status(200).send({
				status: true,
				items: ret,
				count: ret?.length,
			});
		} else {
			return res
				.status(200)
				.send({ status: false, message: "No Items found" });
		}
	},

	// home page
	getArticles: async function (req, res, next) {
		try {
			var axiosConfig = {
				method: "get",
				url: "https://blog.hex.toys/feed",
				headers: {
					"Content-Type": "text/xml",
				},
				data: "{}",
			};
			const result = await axios(axiosConfig);
			const parser = new FastXmlParser.XMLParser();
			const json = parser.parse(result.data);
			const items = json?.rss?.channel?.item;

			if (items && items.length > 0) {
				res.status(200).send({ status: true, items: items });
			} else {
				return res
					.status(200)
					.send({ status: false, message: "Can not get blog data" });
			}
		} catch (error) {
			return res
				.status(200)
				.send({ status: false, message: "Can not get blog data" });
		}
	},

	// leader board
	// getLeaderboard: async function (req, res, next) {
	//   const that = this;
	//   let ret = [];

	//   const soldQuery = [
	//     {
	//       $group: {
	//         _id: '$seller',
	//         tradingVolume: {
	//           $sum: '$usdVolume'
	//         },
	//         tradingCount: {
	//           $sum: '$amount'
	//         },
	//         highPrice: {
	//           $max: '$usdPrice'
	//         },
	//         lowPrice: {
	//           $min: '$usdPrice'
	//         },
	//       }
	//     },
	//     {
	//       $sort: {
	//         tradingVolume: -1
	//       }
	//     },
	//     {
	//       $limit: 100
	//     }
	//   ];

	//   const tradingInfos = await Sold.aggregate(soldQuery);
	//   if (tradingInfos && tradingInfos?.length > 0) {
	//     let token = await Token.findOne({ address: '0x0000000000000000000000000000000000000000' });

	//     let addresses = [];
	//     for (let index = 0; index < tradingInfos.length; index++) {
	//       var tradingInfo = tradingInfos[index];
	//       addresses.push(tradingInfo._id);

	//     }
	//     let users = await User.find({ address: { $in: addresses } }).lean();

	//     for (let index = 0; index < tradingInfos.length; index++) {
	//       var tradingInfo = tradingInfos[index];

	//       let userInfo = users.filter(user => user.address === tradingInfo._id)[0];
	//       userInfo.tradingInfo = tradingInfo;
	//       userInfo.coinPrice = token.rate;
	//       ret.push(userInfo)
	//     }
	//   }

	//   if (ret && ret?.length > 0) {
	//     res.status(200).send({ status: true, users: ret, count: ret?.length });
	//   } else {
	//     return res.status(200).send({ status: false, message: "No Users found" });
	//   }
	// },

	getLeaderboard: async function (req, res, next) {
		try {
			const soldQuery = [
				{
					$group: {
						_id: "$seller",
						tradingVolume: { $sum: "$usdVolume" },
						tradingCount: { $sum: "$amount" },
						highPrice: { $max: "$usdPrice" },
						lowPrice: { $min: "$usdPrice" },
					},
				},
				{
					$sort: {
						tradingVolume: -1,
					},
				},
				{
					$limit: 100,
				},
			];

			const tradingInfos = await Sold.aggregate(soldQuery);

			if (tradingInfos && tradingInfos.length > 0) {
				const addresses = tradingInfos.map((info) => info._id);
				// console.log('addresses', addresses)
				const users = await User.find({ address: { $in: addresses } });

				const token = await Token.findOne({
					address: "0x0000000000000000000000000000000000000000",
				});

				// console.log('tradingInfo', users)
				const ret = tradingInfos.map((tradingInfo) => {
					const userInfo = users.find(
						(user) => user.address === tradingInfo._id
					);
					if (userInfo) {
						userInfo.tradingInfo = tradingInfo;
						userInfo.coinPrice = token.rate;
					}
					return userInfo;
				});
				// console.log('ret111', ret)

				const filteredRet = ret.filter(
					(userInfo) => userInfo !== null && userInfo !== undefined
				);
				if (filteredRet.length > 0) {
					res.status(200).send({
						status: true,
						users: filteredRet,
						count: filteredRet.length,
					});
				} else {
					res.status(200).send({
						status: false,
						message: "No Records found",
					});
				}
			}
		} catch (error) {
			console.error("Error in getLeaderboard:", error);
			res.status(500).send({
				status: false,
				message: "Internal Server Error",
			});
		}
	},

	// for hex toys collection
	getExclusiveItems: async function (req, res, next) {
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 36;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;

		if (!req.query.collection) {
			return res
				.status(200)
				.send({ status: false, message: "missing collection address" });
		}
		const collectionAddr = req.query.collection.toLowerCase();

		Item.find(
			{
				itemCollection: collectionAddr,
			},
			{ __v: 0, _id: 0 }
		)
			.sort({ timestamp: -1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, items) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!items)
					return res
						.status(200)
						.send({ status: false, message: "No Items found" });

				let token = await Token.findOne({
					address: "0x0000000000000000000000000000000000000000",
				});

				let tokenIds = [];
				for (let index = 0; index < items.length; index++) {
					tokenIds.push(items[index].tokenId);
				}

				const soldQuery = [
					{
						$match: {
							itemCollection: collectionAddr,
							tokenId: { $in: tokenIds },
						},
					},
					{
						$group: {
							_id: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							tradingVolume: {
								$sum: "$usdVolume",
							},
							tradingCount: {
								$sum: "$amount",
							},
						},
					},
				];
				const idList = await Sold.aggregate(soldQuery);

				for (let index = 0; index < items.length; index++) {
					let item = items[index];
					item.coinPrice = token.rate;

					const soldinfos = idList.filter(
						(idInfo) =>
							idInfo._id.itemCollection === item.itemCollection &&
							idInfo._id.tokenId === item.tokenId
					);
					if (soldinfos && soldinfos.length > 0) {
						item.tradingVolume = soldinfos[0].tradingVolume;
						item.tradingCount = soldinfos[0].tradingCount;
					} else {
						item.tradingVolume = 0;
						item.tradingCount = 0;
					}

					// setup supply
					var supply = 0;
					for (let index = 0; index < item.holders.length; index++) {
						const holdElement = item.holders[index];
						supply = supply + holdElement.balance;
					}
					item.supply = supply;
				}

				Item.countDocuments(
					{
						itemCollection: collectionAddr,
					},
					function (err2, count) {
						if (err2)
							return res
								.status(200)
								.send({ status: false, message: err2.message });
						res.status(200).send({
							status: true,
							items: items,
							count: count,
						});
					}
				);
			});
	},

	// nft detail
	detail: async function (req, res) {
		if (!req.params.tokenId || !req.params.collection)
			return res
				.status(200)
				.send({ status: false, message: "missing params" });
		let tokenId = req.params.tokenId;
		let itemCollection = req.params.collection.toLowerCase();
		const that = this;
		Item.findOne(
			{ tokenId: tokenId, itemCollection: itemCollection },
			{ __v: 0, _id: 0 }
		)
			.lean()
			.exec(async function (err, item) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!item)
					return res
						.status(200)
						.send({ status: false, message: "No item found" });

				// set supply
				var supply = 0;
				for (let index = 0; index < item.holders.length; index++) {
					const holdElement = item.holders[index];
					supply = supply + holdElement.balance;
				}
				item.supply = supply;

				//set up collection
				var collection = await ItemCollection.findOne(
					{ address: itemCollection },
					{ _id: 0, __v: 0 }
				).lean();
				item.collectionInfo = collection;

				//set up auction information
				var auction = await Auction.findOne(
					{ tokenId: tokenId, itemCollection: itemCollection },
					{ _id: 0, __v: 0 }
				).lean();
				if (auction) {
					auction.price = auction.startPrice;
					let bids = await Bid.find(
						{ auctionId: auction.auctionId },
						{ _id: 0, __v: 0 }
					)
						.sort({ bidPrice: -1 })
						.limit(1000)
						.lean();

					if (bids.length > 0) {
						let addresses = [];
						for (let index = 0; index < bids.length; index++) {
							const bid = bids[index];
							addresses.push(bid.from);
						}
						let users = await User.find({
							address: { $in: addresses },
						});

						for (let index = 0; index < bids.length; index++) {
							const bid = bids[index];

							let fromUsers = users.filter(
								(user) => user.address === bid.from
							);
							if (fromUsers && fromUsers.length > 0) {
								bid.fromUser = fromUsers[0];
							} else {
								bid.fromUser = {
									address: bid.from,
									name: "NoName",
									originalLogo:
										"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
								};
							}
						}
						auction.price = bids[0].bidPrice;
						auction.bids = bids;
					}

					let user = await User.findOne(
						{ address: auction.owner },
						{ _id: 0, __v: 0 }
					).lean();
					if (!user) {
						auction.ownerUser = {
							address: auction.owner.toLowerCase(),
							name: "NoName",
							originalLogo:
								"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
						};
					} else {
						auction.ownerUser = user;
					}
					item.auctionInfo = auction;
				}

				let pairs = await Pair.find(
					{ tokenId: tokenId, itemCollection: itemCollection },
					{ _id: 0, __v: 0 }
				)
					.sort({ usdPrice: 1 })
					.limit(1000)
					.lean();
				if (pairs && pairs.length > 0) {
					let addresses = [];
					for (let index = 0; index < pairs.length; index++) {
						const pair = pairs[index];
						addresses.push(pair.owner);
					}
					let users = await User.find({
						address: { $in: addresses },
					});
					for (let i = 0; i < pairs.length; i++) {
						let pair = pairs[i];

						let ownerUsers = users.filter(
							(user) => user.address === pair.owner
						);
						if (ownerUsers && ownerUsers.length > 0) {
							pair.ownerUser = ownerUsers[0];
						} else {
							pair.ownerUser = {
								address: pair.owner,
								name: "NoName",
								originalLogo:
									"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
							};
						}
					}
					item.pairs = pairs;
				}

				// setup holders
				let addresses = [];
				for (let i = 0; i < Math.min(item.holders.length, 1000); i++) {
					addresses.push(item.holders[i].address);
				}
				let users = await User.find({ address: { $in: addresses } });
				for (let i = 0; i < item.holders.length; i++) {
					let holders = users.filter(
						(user) => user.address === item.holders[i].address
					);
					if (holders && holders.length > 0) {
						item.holders[i].user = holders[0];
					} else {
						item.holders[i].user = {
							address: item.holders[i].address,
							name: "NoName",
							originalLogo:
								"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
						};
					}
				}

				// setup owner
				if (item.type == "single") {
					// set up owner address.
					var ownerAddress = "";
					if (auction) {
						ownerAddress = auction.owner;
					} else if (pairs && pairs?.length > 0) {
						ownerAddress = item.pairs[0].owner;
					} else {
						ownerAddress = item.holders[0].address;
					}

					// setup owner user
					var owner = await User.findOne(
						{ address: ownerAddress },
						{ _id: 0, __v: 0 }
					).lean();
					if (!owner) {
						item.ownerUser = {
							address: ownerAddress,
							name: "NoName",
							originalLogo:
								"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
						};
					} else {
						item.ownerUser = owner;
					}
				}

				// get more items
				let ret_more = [];

				let moreItems = await Item.find(
					{ itemCollection: itemCollection },
					{ __v: 0, _id: 0 }
				)
					.sort({ timestamp: -1 })
					.limit(5)
					.lean();
				for (let i = 0; i < moreItems.length; i++) {
					let moreItem = moreItems[i];
					if (moreItem.tokenId != tokenId && ret_more.length < 4) {
						const itemEntity = await that.getItemDetail(
							moreItem.tokenId,
							moreItem.itemCollection
						);
						ret_more.push(itemEntity);
					}
				}
				await Item.findOneAndUpdate({ tokenId: tokenId,itemCollection:process.env.ITEM_COLLECTION_ADDRESS.toLowerCase() }, {
					isdelist: true,
				});

				item.more = ret_more;
				res.status(200).send({ status: true, item: item });
			});
	},

	// nft detail
	getBids: async function (req, res, next) {
		if (!req.query.auctionId)
			return res
				.status(200)
				.send({ status: false, message: "missing auction id" });
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 20)
			: 10;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;

		Bid.find({ auctionId: Number(req.query.auctionId) }, { __v: 0, _id: 0 })
			.sort({ bidPrice: -1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, bids) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!bids)
					return res
						.status(200)
						.send({ status: false, message: "No bids found" });
				if (bids.length > 0) {
					let addresses = [];
					for (let index = 0; index < bids.length; index++) {
						const bid = bids[index];
						addresses.push(bid.fromUser);
					}
					const users = await User.find({
						address: { $in: addresses },
					});
					for (let index = 0; index < bids.length; index++) {
						const bid = bids[index];
						let fromUsers = users.filter(
							(user) => user.address === bid.from
						);
						if (fromUsers && fromUsers.length > 0) {
							bid.fromUser = fromUsers[0];
						} else {
							bid.fromUser = {
								address: bid.from,
								name: "NoName",
								originalLogo:
									"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
							};
						}
					}
				}

				Bid.countDocuments(
					{ auctionId: Number(req.query.auctionId) },
					function (err2, count) {
						if (err2)
							return res
								.status(200)
								.send({ status: false, message: err2.message });
						res.status(200).send({
							status: true,
							bids: bids,
							count: count,
						});
					}
				);
			});
	},

	// nft detail
	getPairs: async function (req, res, next) {
		if (req.query.itemCollection) {
			req.query.itemCollection = req.query.itemCollection.toLowerCase();
		}
		if (req.query.owner) {
			req.query.owner = req.query.owner.toLowerCase();
		}

		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 20)
			: 10;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;

		delete req.query.limit;
		delete req.query.page;

		Pair.find(req.query, { __v: 0, _id: 0 })
			.sort({ usdPrice: 1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, pairs) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!pairs)
					return res
						.status(200)
						.send({ status: false, message: "No pairs found" });
				if (pairs.length > 0) {
					let addresses = [];
					for (let index = 0; index < pairs.length; index++) {
						const pair = pairs[index];
						addresses.push(pair.owner);
					}
					let users = await User.find({
						address: { $in: addresses },
					});

					for (let index = 0; index < pairs.length; index++) {
						const pair = pairs[index];
						let ownerUsers = users.filter(
							(user) => user.address === pair.owner
						);
						if (ownerUsers && ownerUsers.length > 0) {
							pair.ownerUser = ownerUsers[0];
						} else {
							pair.ownerUser = {
								address: pair.owner,
								name: "NoName",
								originalLogo:
									"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
							};
						}
					}
				}

				Pair.countDocuments(req.query, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						pairs: pairs,
						count: count,
					});
				});
			});
	},

	// get activities
	getActivities: async function (req, res, next) {
		const that = this;
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 10;
		let data = this.handleEventGetRequest(req, limitNum);
		Event.find(data.query, { __v: 0, _id: 0 })
			.sort({ timestamp: -1 })
			.limit(limitNum)
			.skip(data.skip)
			.lean()
			.exec(async function (err, events) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!events)
					return res
						.status(200)
						.send({ status: false, message: "No events found" });
				let from_addresses = [];
				let to_addresses = [];
				let itemIds = [];
				for (let index = 0; index < events.length; index++) {
					const event = events[index];
					from_addresses.push(event.from);
					to_addresses.push(event.to);
					itemIds.push(`${event.itemCollection}-${event.tokenId}`);
				}

				const from_users = await User.find({
					address: { $in: from_addresses },
				});
				const to_users = await User.find({
					address: { $in: to_addresses },
				});
				const items = await Item.find({ id: { $in: itemIds } });

				for (let i = 0; i < events.length; i++) {
					let event = events[i];
					if (event.from) {
						let fromUsers = from_users.filter(
							(user) => user.address === event.from
						);
						if (fromUsers && fromUsers.length > 0) {
							event.fromUser = fromUsers[0];
						} else {
							event.fromUser = {
								address: event.from,
								name: "NoName",
								originalLogo:
									"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
							};
						}
					}
					if (event.to) {
						let toUsers = to_users.filter(
							(user) => user.address === event.to
						);
						if (toUsers && toUsers.length > 0) {
							event.toUsers = toUsers[0];
						} else {
							event.toUsers = {
								address: event.to,
								name: "NoName",
								originalLogo:
									"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
							};
						}
					}
					event.itemInfo = items.filter(
						(item) =>
							item.id ===
							`${event.itemCollection}-${event.tokenId}`
					)[0];
				}

				Event.countDocuments(data.query, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						events: events,
						count: count,
					});
				});
			});
	},

	// item detail to show price chart
	getTradingHistory: async function (req, res, next) {
		const that = this;

		if (req.query.itemCollection) {
			req.query.itemCollection = req.query.itemCollection.toLowerCase();
		}

		if (req.query.seller) {
			req.query.seller = req.query.seller.toLowerCase();
		}

		const soldQuery = [
			{
				$match: req.query,
			},
			{
				$group: {
					_id: {
						year: "$year",
						month: "$month",
						day: "$day",
					},
					tradingVolume: {
						$sum: "$usdVolume",
					},
					tradingCount: {
						$sum: "$amount",
					},
					firstTimestamp: {
						$first: "$timestamp",
					},
				},
			},
			{
				$sort: {
					firstTimestamp: 1,
				},
			},
		];

		let ret = [];
		const tradingList = await Sold.aggregate(soldQuery);
		let token = await Token.findOne({
			address: "0x0000000000000000000000000000000000000000",
		});

		if (tradingList && tradingList?.length > 0) {
			for (let index = 0; index < tradingList.length; index++) {
				let tradingItem = tradingList[index];
				tradingItem.time = `${tradingItem._id.year}-${(tradingItem._id.month < 10 ? "0" : "") +
					tradingItem._id.month
					}-${(tradingItem._id.day < 10 ? "0" : "") + tradingItem._id.day
					}`;
				ret.push(tradingItem);
			}
			res.status(200).send({
				status: true,
				tradings: ret,
				coinPrice: token.rate,
			});
		} else {
			return res
				.status(200)
				.send({ status: false, message: "No trading found" });
		}
	},

	// like nft
	like: async function (req, res, next) {
		if (!req.body.address || !req.body.tokenId || !req.body.itemCollection)
			return res
				.status(200)
				.send({ status: false, message: "missing params" });

		Item.findOne(
			{
				tokenId: req.body.tokenId,
				itemCollection: req.body.itemCollection.toLowerCase(),
			},
			async (err, item) => {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!item)
					return res
						.status(200)
						.send({ status: false, message: "No item found" });

				if (item.likes.includes(req.body.address.toLowerCase())) {
					item.likes.splice(
						item.likes.indexOf(req.body.address.toLowerCase()),
						1
					);
					item.likeCount = item.likeCount - 1;
				} else {
					item.likes.push(req.body.address.toLowerCase());
					item.likeCount = item.likeCount + 1;
				}

				await item.save();

				res.status(200).send({ status: true, item: item });
			}
		);
	},

	// get category
	categories: async function (req, res, next) {
		Category.find({}, { _id: 0, __v: 0 }, async (err, items) => {
			if (err)
				return res
					.status(200)
					.send({ status: false, message: err.message });
			if (!items)
				return res
					.status(200)
					.send({ status: false, message: "No item found" });

			res.status(200).send({ status: true, categories: items });
		});
	},

	// mysterybox
	getMysteryBoxes: async function (req, res, next) {
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 6;
		let data = this.handleMysteryBoxGetRequest(req, limitNum);
		MysteryBox.find(data.query, { __v: 0, _id: 0 })
			.sort(data.sort)
			.limit(limitNum)
			.skip(data.skip)
			.lean()
			.exec(async function (err, mysteryboxes) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!mysteryboxes)
					return res.status(200).send({
						status: false,
						message: "No MysteryBoxes found",
					});

				MysteryBox.countDocuments(data.query, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						mysteryboxes: mysteryboxes,
						count: count,
					});
				});
			});
	},

	getMysteryBoxDetail: async function (req, res, next) {
		MysteryBox.findOne(req.query, async (err, mysterybox) => {
			if (err)
				return res
					.status(200)
					.send({ status: false, message: err.message });
			if (!mysterybox)
				return res
					.status(200)
					.send({ status: false, message: "No MysteryBox found" });

			mysterybox.visible
				? res.status(200).send({ status: true, mysterybox: mysterybox })
				: res.status(200).send({
					status: false,
					message: "You can not see the mysterybox",
				});
		});
	},

	getCards: async function (req, res, next) {
		const that = this;
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 12;
		let data = this.handleCardGetRequest(req, limitNum);
		Card.find(data.query, { __v: 0, _id: 0 })
			.sort(data.sort)
			.limit(limitNum)
			.skip(data.skip)
			.lean()
			.exec(async function (err, cards) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!cards)
					return res
						.status(200)
						.send({ status: false, message: "No cards found" });

				for (let i = 0; i < cards.length; i++) {
					let card = cards[i];
					const itemEntity = await that.getItemDetail(
						card.tokenId,
						card.collectionId
					);
					card.itemInfo = itemEntity;
				}

				Card.countDocuments(data.query, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						cards: cards,
						count: count,
					});
				});
			});
	},
	getCardDetail: async function (req, res, next) {
		const that = this;

		Card.findOne(req.query)
			.lean()
			.exec(async function (err, card) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!card)
					return res
						.status(200)
						.send({ status: false, message: "No Card found" });
				const itemEntity = await that.getItemDetail(
					card.tokenId,
					card.collectionId
				);
				card.itemInfo = itemEntity;
				res.status(200).send({ status: true, card: card });
			});
	},

	// staking
	getStakings: async function (req, res, next) {
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 6;
		delete req.query.limitNum;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		delete req.query.page;
		let skip = (page - 1) * limitNum;

		var account = req.query.account;
		delete req.query.account;
		if (account) {
			account = account.toLowerCase();
		}

		var stakedOnly = req.query.stakedOnly
			? !!JSON.parse(String(req.query.stakedOnly).toLowerCase())
			: false;
		delete req.query.stakedOnly;
		let stakedQuery = {};
		if (stakedOnly == true) {
			if (account) {
				stakedQuery["stakedInfo.owner"] = account;
			} else {
				return res
					.status(200)
					.send({ status: false, message: "missing account params" });
			}
		}

		var creatorAddress = req.query.creatorAddress;
		if (creatorAddress) {
			req.query.creatorAddress = creatorAddress.toLowerCase();
		}

		const currentTimeStamp = Math.floor(Date.now() / 1000);
		var finishStatus = req.query.finishStatus
			? !!JSON.parse(String(req.query.finishStatus).toLowerCase())
			: false;
		delete req.query.finishStatus;
		if (finishStatus) {
			req.query.endTime = { $lt: currentTimeStamp };
		} else {
			req.query.endTime = { $gt: currentTimeStamp };
		}

		var sortBy = req.query.sortBy;
		delete req.query.sortBy;
		let sort = {};
		if (sortBy === "hot") {
			sort = { endTime: 1 };
		} else if (sortBy === "apr") {
			sort = { apr: -1 };
		} else if (sortBy === "total_staked") {
			sort = { totalStakedNfts: -1 };
		}

		const aggregateQuery = [
			{
				$match: req.query,
			},
			{
				$lookup: {
					from: "stakeditems",
					localField: "address",
					foreignField: "stakingAddress",
					as: "stakedInfo",
				},
			},
			{
				$match: stakedQuery,
			},
			{
				$project: { stakedInfo: 0 },
			},
			{
				$sort: sort,
			},
			{
				$limit: skip + limitNum,
			},
			{
				$skip: skip,
			},
		];

		let ret = [];
		const stakings = await Staking.aggregate(aggregateQuery);
		if (stakings && stakings.length > 0) {
			for (let index = 0; index < stakings.length; index++) {
				let staking = stakings[index];
				if (account) {
					// set staked nfts
					let stakeditems = await StakedItem.find(
						{
							stakingAddress: staking.address,
							owner: account,
							amount: { $gt: 0 },
						},
						{ __v: 0, _id: 0 }
					)
						.sort({ amount: -1 })
						.lean();
					if (stakeditems && stakeditems.length > 0) {
						for (let i = 0; i < stakeditems.length; i++) {
							const stakeditem = stakeditems[i];
							var itemInfo = await Item.findOne(
								{
									itemCollection: stakeditem.stakeNftAddress,
									tokenId: stakeditem.tokenId,
								},
								{ __v: 0, _id: 0 }
							).lean();
							if (itemInfo) {
								stakeditem.itemInfo = itemInfo;
							}
						}
					}
					staking.stakeditems = stakeditems;

					// set owned nfts
					const nftMatchQuery = {};
					nftMatchQuery.itemCollection = staking.stakeNftAddress;
					nftMatchQuery["holders.address"] = account;
					nftMatchQuery["holders.balance"] = { $gt: 0 };

					let owneditems = await Item.find(nftMatchQuery, {
						__v: 0,
						_id: 0,
					})
						.sort({ timestamp: -1 })
						.lean();
					staking.owneditems = owneditems;

					// set collection info
					let itemCollection = ItemCollection.findOne(
						{ address: staking.stakeNftAddress },
						{ __v: 0, _id: 0 }
					).lean();
					staking.collectionInfo = itemCollection;
				}
				ret.push(staking);
			}
		}

		const totalQuery = [
			{
				$match: req.query,
			},
			{
				$lookup: {
					from: "stakeditems",
					localField: "address",
					foreignField: "stakingAddress",
					as: "stakedInfo",
				},
			},
			{
				$match: stakedQuery,
			},
			{
				$project: { stakedInfo: 0 },
			},
			{
				$group: {
					_id: null,
					totalCount: {
						$sum: 1,
					},
				},
			},
		];
		let count = 0;
		const totalInfos = await Staking.aggregate(totalQuery);
		if (totalInfos && totalInfos?.length > 0) {
			count = totalInfos[0].totalCount;
		}

		if (count > 0) {
			res.status(200).send({ status: true, stakings: ret, count: count });
		} else {
			return res
				.status(200)
				.send({ status: false, message: "No Stakings found" });
		}
	},
	stakingDetail: async function (req, res) {
		if (!req.query.address)
			return res
				.status(200)
				.send({ status: false, message: "missing address" });
		let address = req.query.address.toLowerCase();

		var account = req.query.account;
		delete req.query.account;
		if (account) {
			account = account.toLowerCase();
		}

		Staking.findOne({ address: address }, { __v: 0, _id: 0 })
			.lean()
			.exec(async function (err, staking) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!staking)
					return res
						.status(200)
						.send({ status: false, message: "No staking found" });

				//set up collection
				var collection = await ItemCollection.findOne(
					{ address: staking.stakeNftAddress },
					{ _id: 0, __v: 0 }
				).lean();
				staking.collectionInfo = collection;

				if (account) {
					// set staked nfts
					let stakeditems = await StakedItem.find(
						{
							stakingAddress: staking.address,
							owner: account,
							amount: { $gt: 0 },
						},
						{ __v: 0, _id: 0 }
					)
						.sort({ amount: -1 })
						.lean();
					if (stakeditems && stakeditems.length > 0) {
						for (let i = 0; i < stakeditems.length; i++) {
							const stakeditem = stakeditems[i];
							var itemInfo = await Item.findOne(
								{
									itemCollection: stakeditem.stakeNftAddress,
									tokenId: stakeditem.tokenId,
								},
								{ __v: 0, _id: 0 }
							).lean();
							if (itemInfo) {
								stakeditem.itemInfo = itemInfo;
							}
						}
					}
					staking.stakeditems = stakeditems;

					// set owned nfts
					const nftMatchQuery = {};
					nftMatchQuery.itemCollection = staking.stakeNftAddress;
					nftMatchQuery["holders.address"] = account;
					nftMatchQuery["holders.balance"] = { $gt: 0 };

					let owneditems = await Item.find(nftMatchQuery, {
						__v: 0,
						_id: 0,
					})
						.sort({ timestamp: -1 })
						.lean();
					staking.owneditems = owneditems;
				}
				res.status(200).send({ status: true, staking: staking });
			});
	},

	// search
	searchCollections: async function (req, res, next) {
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 12;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;

		const search = req.query.search;

		let dataQuery = {};
		if (search) {
			dataQuery = { $text: { $search: search } };
		}

		dataQuery = {
			$and: [{ isSynced: true }, { visibility: true }, dataQuery],
		};

		ItemCollection.find(dataQuery, { __v: 0, _id: 0 })
			.sort({ timestamp: -1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, collections) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!collections)
					return res.status(200).send({
						status: false,
						message: "No Collections found",
					});

				let ret = [];

				let addresses = [];
				for (let index = 0; index < collections.length; index++) {
					const collection = collections[index];
					addresses.push(collection.ownerAddress);
				}
				const users = await User.find({ address: { $in: addresses } });

				for (let i = 0; i < collections.length; i++) {
					let collection = collections[i];
					let ownerUsers = users.filter(
						(user) => user.address === collection.ownerAddress
					);
					if (ownerUsers && ownerUsers.length > 0) {
						collection.ownerUser = ownerUsers[0];
					} else {
						collection.ownerUser = {
							address: collection.ownerAddress,
							name: "NoName",
							originalLogo:
								"https://ipfs.hex.toys/ipfs/QmaxQGhY772ffG7dZpGsVoUWcdSpEV1APru95icXKmii67",
						};
					}
					ret.push(collection);
				}

				ItemCollection.countDocuments(
					dataQuery,
					function (err2, count) {
						if (err2)
							return res
								.status(200)
								.send({ status: false, message: err2.message });
						res.status(200).send({
							status: true,
							collections: ret,
							count: count,
						});
					}
				);
			});
	},

	searchItems: async function (req, res, next) {
		const that = this;
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 12;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;

		const search = req.query.search;

		let dataQuery = {};
		if (search) {
			dataQuery = { $text: { $search: search } };
		}

		Item.find(dataQuery, { __v: 0, _id: 0 })
			.sort({ timestamp: -1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, items) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!items)
					return res
						.status(200)
						.send({ status: false, message: "No Items found" });

				Item.countDocuments(dataQuery, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						items: items,
						count: count,
					});
				});
			});
	},

	searchUsers: async function (req, res, next) {
		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 12;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;

		const search = req.query.search;

		let dataQuery = {};
		if (search) {
			dataQuery = { $text: { $search: search } };
		}

		User.find(dataQuery, { __v: 0, _id: 0 })
			.sort({ timestamp: -1 })
			.limit(limitNum)
			.skip(skip)
			.lean()
			.exec(async function (err, users) {
				if (err)
					return res
						.status(200)
						.send({ status: false, message: err.message });
				if (!users)
					return res
						.status(200)
						.send({ status: false, message: "No Users found" });

				User.countDocuments(dataQuery, function (err2, count) {
					if (err2)
						return res
							.status(200)
							.send({ status: false, message: err2.message });
					res.status(200).send({
						status: true,
						users: users,
						count: count,
					});
				});
			});
	},

	// get overview
	getOverview: async function (req, res, next) {
		// get coin price
		let token = await Token.findOne({
			address: "0x0000000000000000000000000000000000000000",
		});

		// get total volume
		const totalVolumeQuery = [
			{
				$group: {
					_id: null,
					tradingVolume: {
						$sum: "$usdVolume",
					},
					tradingCount: {
						$sum: "$amount",
					},
				},
			},
		];
		let tradingVolume = 0;
		let tradingCount = 0;
		const tradingVolumeInfos = await Sold.aggregate(totalVolumeQuery);
		if (tradingVolumeInfos && tradingVolumeInfos?.length > 0) {
			tradingVolume = tradingVolumeInfos[0].tradingVolume;
			tradingCount = tradingVolumeInfos[0].tradingCount;
		}

		// get total collection
		let collectionCount = await ItemCollection.countDocuments({});

		// get total items
		let itemCount = await Item.countDocuments({});

		// get total users
		let userCount = await User.countDocuments({});

		let gas = await Gas.findOne({});
		res.status(200).send({
			status: true,
			overview: {
				collectionCount: collectionCount,
				itemCount: itemCount,
				userCount: userCount,
				tradingVolume: tradingVolume,
				tradingCount: tradingCount,
				coinPrice: token?.rate,
				gasUsed: gas?.total,
			},
		});
	},

	// manage request query
	handleItemGetRequest: function (req, limit) {
		delete req.query.limit;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;

		let sortDir =
			req.query.sortDir === "asc" || req.query.sortDir === "desc"
				? req.query.sortDir
				: "desc";

		const sortBy =
			req.query.sortBy === "name" ||
				req.query.sortBy === "likeCount" ||
				req.query.sortBy === "usdPrice" ||
				req.query.sortBy === "timestamp"
				? req.query.sortBy
				: "timestamp";

		delete req.query.page;
		delete req.query.sortBy;
		delete req.query.sortDir;

		if (sortDir === "asc") sortDir = 1;
		else if (sortDir === "desc") sortDir = -1;

		let sort;
		if (sortBy === "name") {
			sort = { name: sortDir };
		} else if (sortBy === "likeCount") {
			sort = { likeCount: sortDir };
		} else if (sortBy === "usdPrice") {
			sort = { usdPrice: sortDir };
		} else {
			sort = { blockNumber: sortDir };
		}

		if (req.query.likes) {
			req.query.likes = req.query.likes.toLowerCase();
		}

		if (req.query.owner) {
			req.query["holders.address"] = req.query.owner.toLowerCase();
			delete req.query.owner;
		}

		if (req.query.itemCollection) {
			req.query.itemCollection = req.query.itemCollection.toLowerCase();
		}

		var saleType = req.query.saleType;
		delete req.query.saleType;

		if (saleType == "auction") {
			req.query.marketList = "auction";
		} else if (saleType == "fixed") {
			req.query.marketList = "pair";
		} else if (saleType == "all") {
			req.query.marketList = { $in: ["auction", "pair"] };
		} else if (saleType == "not_sale") {
			req.query.marketList = { $nin: ["auction", "pair"] };
			// req.query.marketList = ''
		}
		req.query.isSynced = true;
		req.query.visibility = true;

		const searchTxt = req.query.searchTxt;
		delete req.query.searchTxt;
		if (searchTxt) {
			req.query = {
				$and: [req.query, { $text: { $search: searchTxt } }],
			};
		}

		if (req.query.attributes) {
			let attributeQuery = [];
			let attributes = JSON.parse(req.query.attributes);
			delete req.query.attributes;
			for (let index = 0; index < attributes.length; index++) {
				const attribute = attributes[index];
				attributeQuery.push({
					attributes: {
						$elemMatch: {
							trait_type: attribute.trait_type,
							value: { $in: attribute.values },
						},
					},
				});
				// req.query.attributes = { $elemMatch: { trait_type: attribute.trait_type, value: attribute.value } }
			}
			req.query = {
				$and: [req.query, { $and: attributeQuery }],
			};
		}

		return { query: req.query, sort: sort, skip: skip };
	},

	handleEventGetRequest: function (req, limit) {
		delete req.query.limit;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;
		delete req.query.page;

		if (req.query.itemCollection) {
			req.query.itemCollection = req.query.itemCollection.toLowerCase();
		}

		var address = req.query.address;
		delete req.query.address;
		if (address) {
			req.query["$or"] = [
				{ from: address.toLowerCase() },
				{ to: address.toLowerCase() },
			];
		}

		var filter = req.query.filter;
		delete req.query.filter;
		if (filter) {
			var filters = filter.split("_");
			req.query.name = { $in: filters };
		}

		return { query: req.query, skip: skip };
	},

	handleMysteryBoxGetRequest: function (req, limit) {
		delete req.query.limit;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;

		let sortDir =
			req.query.sortDir === "asc" || req.query.sortDir === "desc"
				? req.query.sortDir
				: "desc";

		const sortBy =
			req.query.sortBy === "timestamp" ||
				req.query.sortBy === "cardAmount"
				? req.query.sortBy
				: "cardAmount";

		delete req.query.page;
		delete req.query.sortBy;
		delete req.query.sortDir;

		if (sortDir === "asc") sortDir = 1;
		else if (sortDir === "desc") sortDir = -1;

		let sort;
		if (sortBy === "timestamp") {
			sort = { timestamp: sortDir };
		} else {
			sort = { cardAmount: sortDir };
		}

		if (req.query.owner) {
			req.query.owner = req.query.owner.toLowerCase();
		}

		req.query.status = true;
		req.query.visible = true;

		const searchTxt = req.query.searchTxt;
		delete req.query.searchTxt;
		if (searchTxt) {
			req.query = {
				$and: [req.query, { $text: { $search: searchTxt } }],
			};
		}

		return { query: req.query, sort: sort, skip: skip };
	},

	handleCardGetRequest: function (req, limit) {
		delete req.query.limit;
		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limit;

		let sortDir =
			req.query.sortDir === "asc" || req.query.sortDir === "desc"
				? req.query.sortDir
				: "desc";

		const sortBy =
			req.query.sortBy === "timestamp" || req.query.sortBy === "amount"
				? req.query.sortBy
				: "timestamp";

		delete req.query.page;
		delete req.query.sortBy;
		delete req.query.sortDir;

		if (sortDir === "asc") sortDir = 1;
		else if (sortDir === "desc") sortDir = -1;

		let sort;
		if (sortBy === "amount") {
			sort = { amount: sortDir };
		} else {
			sort = { timestamp: sortDir };
		}

		if (req.query.mysteryboxAddress) {
			req.query.mysteryboxAddress =
				req.query.mysteryboxAddress.toLowerCase();
		}
		req.query.amount = { $gt: 0 };

		return { query: req.query, sort: sort, skip: skip };
	},

	// get nft detail from tokenId and collection address
	getItemDetail: async function (tokenId, itemCollection) {
		const item = await Item.findOne(
			{ tokenId: tokenId, itemCollection: itemCollection },
			{ __v: 0, _id: 0 }
		).lean();
		if (!item) return null;
		var supply = 0;
		for (let index = 0; index < item.holders.length; index++) {
			const holdElement = item.holders[index];
			supply = supply + holdElement.balance;
		}
		item.supply = supply;

		//set up pair information

		const firstPairs = await Pair.find(
			{ tokenId: tokenId, itemCollection: itemCollection },
			{ _id: 0, __v: 0 }
		)
			.sort({ usdPrice: 1 })
			.limit(1)
			.lean();
		if (firstPairs && firstPairs?.length > 0) {
			item.pairInfo = firstPairs[0];
		}

		//set up auction information
		var auction = await Auction.findOne(
			{ tokenId: tokenId, itemCollection: itemCollection },
			{ _id: 0, __v: 0 }
		).lean();
		if (auction) {
			auction.price = auction.startPrice;
			let bids = await Bid.find(
				{ auctionId: auction.auctionId },
				{ _id: 0, __v: 0 }
			)
				.sort({ bidPrice: -1 })
				.limit(1)
				.lean();
			auction.bids = bids;
			if (bids.length > 0) {
				auction.price = bids[0].bidPrice;
			}
			item.auctionInfo = auction;
		}

		//set up collection
		var collection = await ItemCollection.findOne(
			{ address: itemCollection },
			{ _id: 0, __v: 0 }
		).lean();
		item.collectionInfo = collection;

		return item;
	},

	updateSold: async function (req, res, next) {
		Sold.find({}, { _id: 0, __v: 0 }, async (err, solds) => {
			if (err)
				return res
					.status(200)
					.send({ status: false, message: err.message });
			if (!solds)
				return res
					.status(200)
					.send({ status: false, message: "No Sold event found" });

			for (let index = 0; index < solds.length; index++) {
				const sold = solds[index];

				var dateObj = new Date(sold.timestamp * 1000);
				var year = dateObj.getUTCFullYear();
				var month = dateObj.getUTCMonth() + 1; //months from 1-12
				var day = dateObj.getUTCDate();
				var usdVolume = sold.usdPrice * sold.amount;

				await Sold.findOneAndUpdate(
					{
						itemCollection: sold.itemCollection,
						tokenId: sold.tokenId,
						timestamp: sold.timestamp,
						seller: sold.seller,
					},
					{
						year: year,
						month: month,
						day: day,
						usdVolume: usdVolume,
					},
					{ new: true, upsert: true }
				);
			}
			res.status(200).send({ status: true, message: "success" });
		});
	},

	// new version heart head api

	//Item collection

	AddnewField: async function (req, res) {
		const { fieldName, value } = req.body
		try {
			console.log(fieldName, value)
			let updatedField = await Item.updateMany(
				{},
				{ $set: { [fieldName]: value } }
			)

			res.status(201).json({ updatedField })

		} catch (error) {
			res.status(500).json({ "msg": error })
		}
	},

	RecentlyMintedCompoaibleNft: async function (req, res) {
		try {

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 100;

			const page = req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
			let skip = (page - 1) * limitNum;

			const query = {
				itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
				// $or: [
				// 	{
				// 		'attributes.trait_type': 'rarity',
				// 		'attributes.value': {
				// 			$nin: ['true']
				// 		}
				// 	}
				// ]
			};


			const items = await Item.find(query)
				.sort({ mintTimestamp: -1 })
				.limit(limitNum)
	

			res.status(200).send({
				status: true,
				items: items,
			});
		} catch (err) {
			res.status(200).send({
				status: false,
				message: err.message,
			});
		}
	},

	// Item collection my inventory
	/*
queryType:
1 Ultra Rare,
2 Rare
3 Legendary,
4.Common,
5.God Tier
6 All

*/
	MyInventory: async function (req, res) {
		try {
			let items;
			let soldInfo;
			const address = req.query.id;
			const queryType = req.query.type;
			const names = req.query.name;
			const onNotsale = req.query.notsale;
			const onSale = req.query.onsale;
			let currency=req.query.currency


			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;

			let match = [];

			const userAddress = {
				"holders.address": address?.toLowerCase(),
			};

			// Total couts items
			const getCount = async (marketListCondition) => {
				const query = {
					...userAddress,
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};
			const allSellCount = await getCount({ $gt: 0 });
			const allNotSellCount = await getCount({ $size: 0 });


			if (queryType !== 'true') {
				match = [
					{
						$match: {
							...userAddress,
							$and: [
								{ "attributes.value": queryType },
								{ "attributes.value": 'false' },
								(names ? { name: { $in: names } } : {}),
								(onNotsale ? { marketList: { $size: 0 } } : {}), // pass true, not sale filter
								(onSale ? { marketList: { $gt: [] } } : {}),


							]
						},
					},
				];
			} else if (queryType == 'true') {

				match = [
					{
						$match: {
							...userAddress,
							'holders.address': address?.toLowerCase(),
							'attributes.value': 'true',
							...(names ? { name: { $in: names } } : {}),
							...(onNotsale ? { marketList: { $size: 0 } } : {}),
							...(onSale ? { marketList: { $gt: [] } } : {}),



						},
					},
				];
			}
			if (queryType === "All") {
				match = [
					{
						$match: {
							...userAddress,
							itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							'attributes.value': 'false',
							...(names ? { name: { $in: names } } : {}),
							...(onNotsale ? { marketList: { $size: 0 } } : {}),
							...(onSale ? { marketList: { $gt: [] } } : {}),




						},
					},
				];
			}


			// for all collection Traits count 
			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				{ _id: 0, __v: 0 }
			).lean();

			// for user collection Traits count 
			let itemsCollection = await Item.aggregate([
				{
					$match: {
						...userAddress,
						itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
						'attributes.value': 'false',
					},
				},
				{
					$lookup: {
						from: "solds",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{
												$eq: [
													"$itemCollection",
													"$$itemCollection",
												],
											},
											{
												$eq: ["$tokenId", "$$tokenId"],
											},
										],
									},
								},
							},
						],
						as: "soldItems",
					},
				},
				{
					$unwind: {
						path: "$soldItems",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$sort: {
						"soldItems.timestamp": -1,
					},
				},
				{
					$group: {
						_id: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						firstsoldItems: { $first: "$soldItems" },
						rootFields: { $mergeObjects: "$$ROOT" },
					},
				},
				{
					$replaceRoot: {
						newRoot: {
							$mergeObjects: [
								"$rootFields",
								{
									firstsoldItems: "$firstsoldItems",
									price: "$firstsoldItems.price",
									tokenAdr: "$firstsoldItems.tokenAdr",
								},
							],
						},
					},
				},
				{
					$lookup: {
						from: "pairs",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{
												$eq: [
													"$itemCollection",
													"$$itemCollection",
												],
											},
											{
												$eq: ["$tokenId", "$$tokenId"],
											},
										],
									},
								},
							},
						],
						as: "pairItems",
					},
				},
				{
					$unwind: {
						path: "$pairItems",
						preserveNullAndEmptyArrays: true
					},
				},
				{
					$sort: {
						timestamp: -1,
					},
				},
				{
					$project: {
						soldItems: 0,
						firstsoldItems: 0,
					},
				},
				{
					$facet: {
						count: [
							{
								$match: {
									"holders.address": address?.toLowerCase(),
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],
						collectionInfo: [
							{
								$match: {
									"holders.address": address?.toLowerCase(),
								},
							},

							{
								$project: {
									_id: 1,
									name: 1,
									trait_type: {
										$arrayElemAt: [
											"$attributes.trait_type",
											0,
										],
									},
								},
							},
							{
								$group: {
									_id: {
										trait_type: "$trait_type",
										name: "$name",
									},
									count: { $sum: 1 },
								},
							},
							{
								$group: {
									_id: "$_id.trait_type",
									count: { $sum: "$count" },
									traitsValues: {
										$push: {
											value: "$_id.name",
											count: "$count",
										},

									},
								},
							},
							{
								$project: {
									_id: 0,
									name: "$_id",
									count: "$count",
									traitsValues: 1,
								},
							},
							{
								$unwind: "$traitsValues",
							},
							{
								$sort: {
									"traitsValues.value": 1, // Sorting the traitsValues array in ascending order
								},
							},
							{
								$group: {
									_id: "$name",
									count: { $first: "$count" },
									traitsValues: { $push: "$traitsValues" },
								},
							},
							{
								$project: {
									_id: 0,
									name: "$_id",
									count: 1,
									traitsValues: 1,
								},
							},
							{
								$sort: {
									name: 1, // Specify the field and order (1 for ascending, -1 for descending)
								},
							},
						],

						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},


			])

			items = await Item.aggregate([
				...match,
				{
					$lookup: {
						from: "solds",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{
												$eq: [
													"$itemCollection",
													"$$itemCollection",
												],
											},
											{
												$eq: ["$tokenId", "$$tokenId"],
											},
										],
									},
								},
							},
						],
						as: "soldItems",
					},
				},
				{
					$unwind: {
						path: "$soldItems",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$sort: {
						"soldItems.timestamp": -1,
					},
				},
				{
					$group: {
						_id: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						firstsoldItems: { $first: "$soldItems" },
						rootFields: { $mergeObjects: "$$ROOT" },
					},
				},
				{
					$replaceRoot: {
						newRoot: {
							$mergeObjects: [
								"$rootFields",
								{
									firstsoldItems: "$firstsoldItems",
									price: "$firstsoldItems.price",
									tokenAdr: "$firstsoldItems.tokenAdr",
								},
							],
						},
					},
				},
				{
					$lookup: {
						from: "pairs",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{
												$eq: [
													"$itemCollection",
													"$$itemCollection",
												],
											},
											{
												$eq: ["$tokenId", "$$tokenId"],
											},
										],
									},
								},
							},
						],
						as: "pairItems",
					},
				},
				{
					$unwind: {
						path: "$pairItems",
						preserveNullAndEmptyArrays: true
					},
				},
				{
					$sort: {
						timestamp: -1,
					},
				},
				{
					$project: {
						soldItems: 0,
						firstsoldItems: 0,
					},
				},
				{
					$facet: {
						count: [
							{
								$match: {
									"holders.address": address?.toLowerCase(),
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],
						totalTraitCount: [
							{
								$match: {
									"holders.address": address.toLowerCase(),
								},
							},
							{
								$project: {
									_id: 1,
									name: 1,
									trait_type: {
										$arrayElemAt: [
											"$attributes.trait_type",
											0,
										],
									},
								},
							},
							{
								$group: {
									_id: "$trait_type",
									count: { $sum: 1 },
								},
							},
							{
								$sort: {
									_id: 1,
								},
							},
							{
								$project: {
									name: "$_id",
									count: "$count",
									_id: 0,
								},
							},
						],

						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},
			]);

			if (items.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
				});
			}

			 // currency filter function
			 let currency_data=[]

			 let filtered = Tokens.filter((token) => token.symbol === currency);

			 for(let i=0;i<=items[0]?.record?.length -1;i++){
				//  console.log('items55555555555', items[0]?.record[i]?.pairItems?.tokenAdr)
				if(items[0]?.record[i]?.pairItems?.tokenAdr === filtered[0]?.address?.toLowerCase()){
				   currency_data.push(items[i])
				}
			 }
			
 
			 let record	=currency? currency_data[0]?.record:items[0]?.record
			 let pagination =Math.ceil(currency? currency_data[0]?.count?.count/limitNum : items[0]?.count?.count / limitNum)
			 let trait=currency?currency_data[0]?.totalTraitCount :items[0]?.totalTraitCount

			res.send({
				onsale: allSellCount,
				notsale: allNotSellCount,
				count: items[0]?.count?.count || 0,
				items: record || [],
				totalTraitCount: trait|| [],
				collectionInfo: itemsCollection[0]?.collectionInfo,
				totalPages: pagination || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}
	},
	// rarity filter in my inventory
	MyInventoryRarityFilter: async function (req, res) {
		try {
			let items;
			const address = req.query.id;
			const queryType = req.query.type;
			const name = req.query.trait_type;
			const onNotsale = req.query.notsale;
			const onSale = req.query.onsale;
			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;
			let match = [];

			const userAddress = {
				"holders.address": address.toLowerCase(),
			};


			// Total couts items
			const getCount = async (marketListCondition) => {
				const query = {
					...userAddress,
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};
			const allSellCount = await getCount({ $gt: 0 });
			const allNotSellCount = await getCount({ $size: 0 });

			if (queryType == 'All') {
				match = [
					{
						$match: {
							...userAddress,
							$and: [
								{ "attributes.value": 'false' },
								{ 'attributes.trait_type': name }
							],
							...(onNotsale ? { marketList: { $size: 0 } } : {}), // pass true, not sale filter
							...(onSale ? { marketList: { $gt: [] } } : {}),
						},
					},
				];
			} else {
				match = [
					{
						$match: {
							...userAddress,
							$and: [
								{ "attributes.value": queryType },
								{ "attributes.value": 'false' },
								{ 'attributes.trait_type': name }
							],
							...(onNotsale ? { marketList: { $size: 0 } } : {}), // pass true, not sale filter
							...(onSale ? { marketList: { $gt: [] } } : {}),
						},
					},
				];
			}

			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				{ _id: 0, __v: 0 }
			).lean();

			items = await Item.aggregate([
				...match,
				{
					$lookup: {
						from: "solds",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{
												$eq: [
													"$itemCollection",
													"$$itemCollection",
												],
											},
											{
												$eq: ["$tokenId", "$$tokenId"],
											},
										],
									},
								},
							},
						],
						as: "soldItems",
					},
				},
				{
					$unwind: {
						path: "$soldItems",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$sort: {
						"soldItems.timestamp": -1,
					},
				},
				{
					$group: {
						_id: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						firstsoldItems: { $first: "$soldItems" },
						rootFields: { $mergeObjects: "$$ROOT" },
					},
				},
				{
					$replaceRoot: {
						newRoot: {
							$mergeObjects: [
								"$rootFields",
								{
									firstsoldItems: "$firstsoldItems",
									price: "$firstsoldItems.price",
									tokenAdr: "$firstsoldItems.tokenAdr",
								},
							],
						},
					},
				},
				{
					$sort: {
						timestamp: -1,
					},
				},
				{
					$project: {
						soldItems: 0,
						firstsoldItems: 0,
					},
				},
				{
					$facet: {
						count: [
							{
								$match: {
									"holders.address": address.toLowerCase(),
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],
						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},

			]);

			if (items.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
				});
			}

			res.send({
				onsale: allSellCount,
				notsale: allNotSellCount,
				count: items[0]?.count?.count || 0,
				items: items[0]?.record || [],
				totalTraitCount: items[0]?.totalTraitCount,
				collectionInfo: collection,
				totalPages: Math.ceil(items[0]?.count?.count / limitNum) || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}
	},
	// get heart head nft sell
	GetHeartHeadNft: async function (req, res) {
		try {
			const allMintedFlag = req.query.allminteditems === 'allminteditems';
			let items;
			const queryType = req.query.type;
			const names = req.query.name;  // test api for trait filter names =name
			let currency=req.query.currency
			let filtered = Tokens.filter((token) => token.symbol === currency);

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;

			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;

			const getCount = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};

			const allCount = await getCount({ $size: 0 });

			const allSellCount = await getCount({ $gt: 0 });


			// Dynamic sorting based on user's preference
			const sortField = allMintedFlag ? 'timestamp' : req.query.sortField ? 'pairItems.' + req.query.sortField : 'pairItems.timestamp';
			const sortOrder = allMintedFlag ? -1 : req.query.sortOrder ? (req.query.sortOrder.toLowerCase() === 'desc' ? -1 : 1) : -1;
			const sortStage = { $sort: { [sortField]: sortOrder } };
			let match = [];

			if (queryType === "All") {
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							"attributes.value": 'false',
							...(names ? { name: { $in: names } } : {})

						},
					},
				];
			} else {
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							$and: [
								{ "attributes.value": queryType },
								{ "attributes.value": 'false' },
								(names ? { name: { $in: names } } : {})
								
							],


						},
					},
				];
			}
			const allItemsData = [ 
				{
					$lookup: {
						from: "pairs",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ["$itemCollection", "$$itemCollection"] },
											{ $eq: ["$tokenId", "$$tokenId"] },
										],
									},
								},
							},
						],
						as: "pairItems",
					},
				},
				{
					$unwind: {
						path: "$pairItems",
						preserveNullAndEmptyArrays: true
					},
				}
				
			];
			
			const allSellData
				= [
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: [
														"$itemCollection",
														"$$itemCollection",
													],
												},
												{
													$eq: ["$tokenId", "$$tokenId"],
												},
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: '$pairItems'
					}

				];

			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				// { _id: 0, __v: 0 }
			).lean();

			const data = allMintedFlag ? allItemsData : allSellData

		
            // currency filter function
			let traitCountCurrency
			let result_currency
			if(currency){
				traitCountCurrency=await Item.aggregate([
					{
						$facet: {
							totalTraitCount: [
								{
									$match: {
										$and: [
											{
												itemCollection:
													process.env.ITEM_COLLECTION_ADDRESS.toLowerCase()
											},
											{ 'attributes.trait_type': "composed" },
											{ 'attributes.value': "false" },
	
	
										]
									},
								},
								{
									$project: {
										_id: 1,
										name: 1,
										trait_type: {
											$arrayElemAt: [
												"$attributes.trait_type",
												0,
											],
										},
									},
								},
								{
									$group: {
										_id: "$trait_type",
										count: { $sum: 1 },
									},
								},
								{
									$sort: {
										_id: 1,
									},
								},
								{
									$project: {
										name: "$_id",
										count: "$count",
										_id: 0,
									},
								},
							]
						},
					},
				])

				 result_currency = await Item.aggregate([
					...match,
					{
						$match: {
							marketList: { $ne: [] } // Filter out documents where marketList is not empty
						}
					},
					{
						$lookup: {
							from: 'pairs',
							localField: 'tokenId',
							foreignField: 'tokenId',
							as: 'pairItems'
						}
					},
					{
						$unwind: '$pairItems' // Deconstruct the array
					},
					{
						$match: {
							'pairItems.tokenAdr': filtered[0]?.address // Filter documents by pair address
						}
					},
					{
						$sort: {
							timestamp: -1 // Sort by timestamp in descending order (latest first)
						}
					},
					{
						$group: {
							_id: '$_id',
							itemData: { $first: '$$ROOT' }, // Preserve the full object data from Item collection
							joinedData: { $push: '$pairItems' }, // Push pairItems data
						}
					},
					{
						$unwind: '$joinedData' // Deconstruct the joinedData array
					},
					
					{
						$project: {
							_id: 0,
							'itemData._id': 0, // Exclude _id from itemData
							'joinedData._id': 0, // Exclude _id from the joinedData
							// Include other fields from Item collection if needed
						}
					},
					{
						$group: {
							_id: null,
							count: { $sum: 1 }, // Count the documents
							data: { $push: { $mergeObjects: ['$itemData', { joinedData: '$joinedData' }] } } // Merge itemData with joinedData
						}
					},
					{
						$project: {
							_id: 0,
							count: 1,
							data: { $slice: ['$data', skip, limitNum] } // Apply pagination to the data array
						}
					}
					
				]);	
			}else{
				items = await Item.aggregate([
					...match,
					...data,
					sortStage,
					{
						$facet: {
							count: [
								{
									$match: {
										itemCollection:
											process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
									},
								},
								{
									$count: "count",
								},
							],
							totalTraitCount: [
								{
									$match: {
										$and: [
											{
												itemCollection:
													process.env.ITEM_COLLECTION_ADDRESS.toLowerCase()
											},
											{ 'attributes.trait_type': "composed" },
											{ 'attributes.value': "false" },
	
	
										]
									},
								},
								{
									$project: {
										_id: 1,
										name: 1,
										trait_type: {
											$arrayElemAt: [
												"$attributes.trait_type",
												0,
											],
										},
									},
								},
								{
									$group: {
										_id: "$trait_type",
										count: { $sum: 1 },
									},
								},
								{
									$sort: {
										_id: 1,
									},
								},
								{
									$project: {
										name: "$_id",
										count: "$count",
										_id: 0,
									},
								},
							],
	
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",
					},
				]);
			}

			if (items?.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
					});
				}

			

			let record	=currency? result_currency[0]?.data:items[0]?.record
			let pagination =Math.ceil(currency? result_currency[0]?.count/limitNum : items[0]?.count?.count / limitNum)
            let trait= currency? traitCountCurrency[0].totalTraitCount:items[0]?.totalTraitCount

			res.send({
				sell_count: allSellCount || 0,
				not_sell_count: allCount,
				items: record || [],
				totalTraitCount: trait|| [],
				collectionInfo: collection,
				totalPages: pagination || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error sell" });
		}
	},

	// catalog v2(version 2)
	GetHeartHeadNftCatalogV2: async function (req, res) {
		try {
			const allMintedFlag = req.query.allminteditems === 'allminteditems';
			let items;
			let totalPages;
			let totalItemCount;
			let notOnSale=req.query.not_on_sale =='yes'
			let price_filter= req.query.price_filter == 'yes'
			const queryType = req.query.type; //filter by rarity name like Rare,common etc.. ,if pass All it give all rarity name
			const type = req.query.trait_type; // filter by trait type like background,base,if pass All it give all trait type
			let currency=req.query.currency //filter by currency
			const names = req.query.name;   //filter by trait name need to pass array name like ['Black Bowler','Black Bowler','cap']
			let filtered = Tokens.filter((token) => token.symbol === currency); // filter token then give you pass token like PLS etc..
			let sortBy = req.query.sort


			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;

			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;


			const sortField = allMintedFlag ? 'timestamp' : req.query.sortField ? 'pairItems.' + req.query.sortField : 'pairItems.timestamp';
			const sortOrder = allMintedFlag ? -1 : req.query.sortOrder ? (req.query.sortOrder.toLowerCase() === 'desc' ? -1 : 1) : -1;
			const sortStage = { $sort: { [price_filter?`${sortField}`:`item.${sortField}`]: sortOrder } };


			const getCount = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};

			const allCount = await getCount({ $size: 0 });

			const allSellCount = await getCount({ $gt: 0 });

			let match = [];

			

			if (queryType === "All") {
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							   "attributes.value": 'false',
							   ...(notOnSale ? { "marketList": { $size: 0 } } : {}), // filter by notonsale
							   ...(names && Array.isArray(names) && names.length ? { name: { $in: names } } : {}) // filter by trait name
							
						},
					},
				];
			} else {
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							$and: [
								{ "attributes.value": queryType },
								{ "attributes.value": 'false' },
								...(notOnSale ? [{ "marketList": { $size: 0 } }] : []), // filter by notonsale
							],
							...(names && Array.isArray(names) && names.length ? { name: { $in: names } } : {}) // filter by trait name


						},
					},
				];
			}

			const allItemsData=[
			
				{
					$lookup: {
						from: "pairs",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ["$itemCollection", "$$itemCollection"] },
											{ $eq: ["$tokenId", "$$tokenId"] },
										],
									},
								},
							},
						],
						as: "pairItems",
					},
				},
				{
					$unwind: {
						path: "$pairItems",
						preserveNullAndEmptyArrays: true
					},
				},
			]

			const allSellData
				= [
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: [
														"$itemCollection",
														"$$itemCollection",
													],
												},
												{
													$eq: ["$tokenId", "$$tokenId"],
												},
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: '$pairItems'
					}

				];

			const notOnSaleData = [
				{
					$lookup: {
						from: "pairs",
						let: {
							itemCollection: "$itemCollection",
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ["$itemCollection", "$$itemCollection"] },
											{ $eq: ["$tokenId", "$$tokenId"] },
										],
									},
								},
							},
						],
						as: "pairItems",
					},
				},
				{
					$unwind: {
						path: "$pairItems",
						preserveNullAndEmptyArrays: true
					},
				},
				{
					$match: {
						pairItems: { $exists: false } // Filter documents where pairItems array doesn't exist or is empty
					}
				}
			];

			const currencyData=[
				
				{
					$match: {
						marketList: { $ne: [] } // Filter out documents where marketList is not empty
					}
				},
				{
					$lookup: {
						from: 'pairs',
						localField: 'tokenId',
						foreignField: 'tokenId',
						as: 'pairItems'
					}
				},
				{
					$unwind: '$pairItems' // Deconstruct the array
				},
				{
					$match: {
						'pairItems.tokenAdr': filtered[0]?.address // Filter documents by pair address
					}
				}
			]
			
			let data ;
			
			if(allMintedFlag){
				data=allItemsData
			}else if(notOnSale){
				data=notOnSaleData
			}else if(currency){
				data=currencyData
			}
			else{
				data=allSellData
			}
	
           if(allMintedFlag){
			let allSaleDatas = await Item.aggregate([
				...match,
				...allSellData,
				...(type ? [ // Conditional inclusion of $match stage
					{
						$match: {
							itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
									"attributes.value": 'false',
									"attributes.trait_type": type,
						},
					}
				] : []),
				{
					$group: {
						_id: "$name", // Group by the "name" field
						item: { $first: "$$ROOT" },
						minPrice: { $min: "$pairItems.price" }, // Calculate minimum price
						maxPrice: { $max: "$pairItems.price" }, // Calculate maximum price
						minUsdPrice: { $min: "$pairItems.usdPrice" }, // Calculate minimum usdPrice
						maxUsdPrice: { $max: "$pairItems.usdPrice" }, // Calculate maximum usdPrice
						count: { $sum: 1 }, // Count occurrences of each name
						pairItemsUsdPrice: { $push: "$pairItems.price" }, // Create an array of usdPrice values
						pairItemsTokenAdr: { $push: "$pairItems.tokenAdr" }, // Create an array of tokenAdr values

					}
				},
				sortStage,
				{
					$project: {
						trait_name: "$_id", // Rename _id to customerName
						count: 1, // Retain the count field
						minPrice: 1,
                        maxPrice: 1,
						minUsdPrice:1,
						mixUsdPrice:1,
						tokenAdr: {
							$arrayElemAt: ["$pairItemsTokenAdr", { $indexOfArray: ["$pairItemsUsdPrice", "$minPrice"] }] // Get the tokenAdr corresponding to the minPrice
						},
						item:1,
						_id: 0 // Exclude the _id field
					}
				},
				
			]);

			let allNotSaleDatas = await Item.aggregate([
				...match,
				{
					$match:{
						"marketList": { $size: 0 }
					}
				},
				sortStage,
				...notOnSaleData,
				...(type ? [ // Conditional inclusion of $match stage
					{
						$match: {
							itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
									"attributes.value": 'false',
									"attributes.trait_type": type,
						},
					}
				] : []),
				{
					$group: {
						_id: "$name", // Group by the "name" field
						item: { $first: "$$ROOT" },
						count: { $sum: 1 } // Count occurrences of each name
					}
				},
				sortStage,
				{
					$project: {
						trait_name: "$_id", // Rename _id to customerName
						count: 1, // Retain the count field
						item:1,
						_id: 0 // Exclude the _id field
					}
				},
				
			]);
            
			let totalData=[...allSaleDatas,...allNotSaleDatas]
			// console.log('totalData', totalData)
			totalItemCount=totalData?.length
			totalPages = Math.ceil((totalItemCount) / limitNum);
			items = totalData?.slice(skip, skip + limitNum)
            // console.log('items', items,page,totalPages)
		   }
		   else if(price_filter){
				let totalData = await Item.aggregate([
					...match,
					...allSellData,
					sortStage,
					{
						$facet: {
							count: [
								{
									$match: {
										itemCollection:
											process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
									},
								},
								{
									$count: "count",
								},
							],
	
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",
					},
				]);

				totalPages=Math.ceil(totalData[0]?.count?.count / limitNum)
				items=totalData[0]?.record

		  }
		   else{
			
				let totalData = await Item.aggregate([
					...match,
					...data,
					...(type ? [ // Conditional inclusion of $match stage
						{
							$match: {
								itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
										"attributes.value": 'false',
										"attributes.trait_type": type,
							},
						}
					] : []),
					{
						$group: {
							_id: "$name", // Group by the "name" field
							item: { $first: "$$ROOT" },
							minPrice: { $min: "$pairItems.price" }, // Calculate minimum price
							maxPrice: { $max: "$pairItems.price" }, // Calculate maximum price
							minUsdPrice: { $min: "$pairItems.usdPrice" }, // Calculate minimum usdPrice
							maxUsdPrice: { $max: "$pairItems.usdPrice" }, // Calculate maximum usdPrice
							pairItemsUsdPrice: { $push: "$pairItems.price" }, // Create an array of usdPrice values
							pairItemsTokenAdr: { $push: "$pairItems.tokenAdr" }, // Create an array of tokenAdr values
							count: { $sum: 1 }, // Count occurrences of each name
							
						}
					},
					sortStage,
					{
						$project: {
							trait_name: "$_id", // Rename _id to customerName
							count: 1, // Retain the count field
							minPrice: 1,
                            maxPrice: 1,
							minUsdPrice:1,
							maxUsdPrice:1,
							tokenAdr: {
								$arrayElemAt: ["$pairItemsTokenAdr", { $indexOfArray: ["$pairItemsUsdPrice", "$minPrice"] }] // Get the tokenAdr corresponding to the minPrice
							},
							item:1,
							_id: 0 // Exclude the _id field
						}
					},
					{
							$sort: {
							  'minUsdPrice': sortBy === 'asc' ? 1 : -1
							}
						  
					  }
					
				]);

				totalItemCount=totalData?.length
			    totalPages = Math.ceil(totalItemCount / limitNum);
			    items = totalData?.slice(skip, skip + limitNum)
		   }
		   
			
            // console.log('item', items)
			const totalTraitCountPipeline = [
				...match,
				{
					$match: {
						itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
						"attributes.trait_type": "composed",
						"attributes.value": "false"
					},
				},
				{
					$project: {
						_id: 1,
						name: 1,
						trait_type: {
							$arrayElemAt: [
								"$attributes.trait_type",
								0,
							],
						},
					},
				},
				{
					$group: {
						_id: "$trait_type",
						count: { $sum: 1 },
					},
				},
				{
					$sort: {
						_id: 1,
					},
				},
				{
					$project: {
						name: "$_id",
						count: "$count",
						_id: 0,
					},
				},
			];
			const totalTraitCount = await Item.aggregate(totalTraitCountPipeline);

            // collection info
			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
			).lean();
		
			let record	=items

			res.send({
				stackedCount: totalItemCount,
				sell_count: allSellCount || 0,
				not_sell_count: allCount,
				items: record || [],
				totalTraitCount,
				collectionInfo:collection,
				totalPages
			});


		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error sell" });
		}
	},


	// get catalog data trait_name wise 
	
	GetTraitNameDataCatalogV2:async function(req,res){
		try{
			let names=req.query.trait_name;
			let is_marketList=req.query.is_marketList==='yes';
			let is_not_marketList=req.query.is_not_marketList==='yes';
			let items
			let currency=req.query.currency
			let filtered = Tokens.filter((token) => token.address === currency);

		   let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;

			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;

			let match = [];

			
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							"attributes.value": 'false',
							...(names ? { "name": names } : {}), // Conditionally match by name if provided
							...(is_marketList ? { marketList: { $gt: [] } } : {}),
							...(is_not_marketList ? { marketList: { $size: 0 } } : {}),
						},
					},
				];
				const allItemsData=[
			
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$itemCollection", "$$itemCollection"] },
												{ $eq: ["$tokenId", "$$tokenId"] },
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: {
							path: "$pairItems",
							preserveNullAndEmptyArrays: true
						},
					},
				]
				
				const allSellData
				= [
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: [
														"$itemCollection",
														"$$itemCollection",
													],
												},
												{
													$eq: ["$tokenId", "$$tokenId"],
												},
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: '$pairItems'
					}

				];

				const currencyData=[
				
					{
						$match: {
							marketList: { $ne: [] } // Filter out documents where marketList is not empty
						}
					},
					{
						$lookup: {
							from: 'pairs',
							localField: 'tokenId',
							foreignField: 'tokenId',
							as: 'pairItems'
						}
					},
					{
						$unwind: '$pairItems' // Deconstruct the array
					},
					{
						$match: {
							'pairItems.tokenAdr': filtered[0]?.address // Filter documents by pair address
						}
					}
				]

				let data
				if(is_marketList){
                    data=allSellData
				}else if(currency){
					data=currencyData
				}else{
					// data=allSellData
					data=allItemsData
				}

				
				items =await Item.aggregate([
					...match,
					{
						$sort:{
							timestamp:-1
						}
					},
                    ...data,
					{
						$facet: {
							count: [
								...match,
								{
									$count: "count",
								},
							],
	
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count", // Flatten the count facet result
					},

				])
			
   
			 let count=items[0]?.count?.count ||0;
			 let datas=items[0]?.record || [];
			 let totalPages= Math.ceil(count/limitNum || 0)

			res.send({
				count,
				items:datas,
				totalPages
			});

		}catch(err){
			console.log(err)
			res.status(500).json({ message: "Internal server error get catalog data trait_name" });
		}
	},


	// rarity filter heart head sell
	GetHeartHeadNftRarityFilter: async function (req, res) {
		try {
			const { trait_type, type, limit, page, allminteditems, name,currency } = req.query;
			// convert to array
			// let nameArray=[name]
			// const names = nameArray[0]?.split(',');
			let names = name

			const limitNum = limit ? Math.min(parseInt(limit), 60) : 12;
			const skip = (page && parseInt(page)) ? (parseInt(page) - 1) * limitNum : 0;

			const itemCollectionAddress = process.env.ITEM_COLLECTION_ADDRESS.toLowerCase();

			const match = type === "All"
				? [{ $match: { itemCollection: itemCollectionAddress, $and: [{ 'attributes.trait_type': trait_type, "attributes.value": 'false' }, (names ? { name: { $in: names } } : {})] } }]
				: [{ $match: { "attributes.value": type, itemCollection: itemCollectionAddress, $and: [{ 'attributes.trait_type': trait_type, "attributes.value": 'false' }, (names ? { name: { $in: names } } : {})] } }];

			const getCount = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'

				};
				return await Item.countDocuments(query).exec();
			};

			const allCount = await getCount({ $size: 0 });

			const allSellCount = await getCount({ $gt: 0 });
			// Dynamic sorting based on user's preference
			const sortField = allminteditems ? 'timestamp' : req.query.sortField ? 'pairItems.' + req.query.sortField : 'pairItems.timestamp';
			const sortOrder = allminteditems ? -1 : req.query.sortOrder ? (req.query.sortOrder.toLowerCase() === 'desc' ? -1 : 1) : -1;
			const sortStage = { $sort: { [sortField]: sortOrder } };
			// console.log("----------",sortStage)

			const allItemsData
				= [
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: [
														"$itemCollection",
														"$$itemCollection",
													],
												},
												{
													$eq: ["$tokenId", "$$tokenId"],
												},
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: {
							path: "$pairItems",
							preserveNullAndEmptyArrays: true
						},
					},
				];
			const allSellData
				= [
					{
						$lookup: {
							from: "pairs",
							let: {
								itemCollection: "$itemCollection",
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{
													$eq: [
														"$itemCollection",
														"$$itemCollection",
													],
												},
												{
													$eq: ["$tokenId", "$$tokenId"],
												},
											],
										},
									},
								},
							],
							as: "pairItems",
						},
					},
					{
						$unwind: '$pairItems'
					},
				];
			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				{ _id: 0, __v: 0 }
			).lean();

			const data = allminteditems ? allItemsData : allSellData

			const items = await Item.aggregate([
				...match,
				...data,
				sortStage,
				{
					$facet: {
						count: [
							{
								$match: {
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],

						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},
			]);

			if (items.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
				});
			}

			// currency filter function
			let currency_data=[]

			let filtered = Tokens.filter((token) => token.symbol === currency);
			
			// for(let i=0;i<=items[0]?.record?.length -1;i++){
			// 	// console.log('items55555555555', items[0]?.record[i]?.pairItems?.tokenAdr)
            //    if(items[0]?.record[i]?.pairItems?.tokenAdr === filtered[0]?.address?.toLowerCase()){
			// 	  currency_data.push(items[i])
			//    }
			// }
			// console.log('+++++++++++++++++')
			// 	// console.log('currency_data', currency_data[0]?.totalTraitCount|| 0)
			// 	console.log('currency_data', currency_data[0]?.record?.length || 0)
			// 	console.log('page',Math.ceil(currency_data[0]?.count?.count/limitNum || 0))
			// 	console.log('filtered', filtered)

			let record	=currency? currency_data[0]?.record:items[0]?.record
			let pagination =Math.ceil(currency? currency_data[0]?.count?.count/limitNum : items[0]?.count?.count / limitNum)
            let trait=currency?currency_data[0]?.totalTraitCount :items[0]?.totalTraitCount

			let sellCount = allminteditems ? allSellCount : items[0]?.count?.count
			res.send({
				// items,
				not_sell_count: allCount || 0,
				sell_count: sellCount || 0,
				items: record || [],
				totalTraitCount: trait || [],
				collectionInfo: collection,
				totalPages: pagination || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error sell" });
		}
	},


	GetUserComposableName: async function (req, res, next) {
		const address = req.query.id;
		const userAddress = {
			"holders.address": address.toLowerCase(),
		};
		const record = await Item.aggregate([
			{
				$match: {
					...userAddress,
					itemCollection:
						process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
				},
			},
			{
				$addFields: {
					trait_type: { $arrayElemAt: ["$attributes.trait_type", 0] },
				},
			},
			{
				$group: {
					_id: "$trait_type",
					rootFields: { $mergeObjects: "$$ROOT" },
				},
			},
			{
				$replaceRoot: {
					newRoot: "$rootFields",
				},
			},
			{
				$match: {
					trait_type: { $exists: true },
				},
			},
			{
				$sort: {
					trait_type: 1,
				},
			},
			{
				$project: { trait_type: 1 },
			},
		]);

		res.send({
			items: record,
		});
	},
	// get mintes item for user for stacked
	GetComposableItemByName: async function (req, res, next) {
		const address = req.query.id;
		const type = req.query.type;

		let limitNum = req.query.limit
			? Math.min(parseInt(req.query.limit), 60)
			: 100;

		const page =
			req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
		let skip = (page - 1) * limitNum;
		let match = []

		match = [
			{
				$match: {
					itemCollection:
						process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
					"holders.address": address.toLowerCase(),
					"attributes.trait_type": type,
				},
			}
		]

		let itemCount = await Item.aggregate([
			{
				$match: {
					"holders.address": address.toLowerCase(),
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
					"attributes.trait_type": type,
					"attributes.value": "false"
				}
			},
			{
				$group: {
					_id: "$name", // Group by the "name" field
					doc: { $first: "$$ROOT" }, // Keep the first document encountered for each name
					count: { $sum: 1 } // Count occurrences of each name
				}
			},
			{
				$sort: {
					_id: 1
				}
			}
		]);


		let items = await Item.aggregate([
			...match,
			{
				$match: {
					attributes: {
						$elemMatch: {
							trait_type: 'composed',
							value: 'false'
						}
					}
				}
			},
			{
				$group: {
					_id: "$name", // Group by the "name" field
					doc: { $first: "$$ROOT" }, // Keep the first document encountered for each name
					count: { $sum: 1 } // Count occurrences of each name
				}
			},
			{
				$replaceRoot: { newRoot: "$doc" } // Replace the root document with the original document
			},
			{
				$sort: {
					timestamp: -1,
				},
			},
			{
				$facet: {
					count: [
						{
							$match: {
								"holders.address": address.toLowerCase(),
								itemCollection:
									process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							},
						},
						{
							$count: "count",
						},
					],

					record: [
						{
							$skip: skip, // Skip a certain number of documents based on the current page
						},
						{
							$limit: limitNum, // Limit the number of documents per page
						},
					],
				},
			},
		])

		res.send({
			count: items[0]?.count[0]?.count || 0,
			// items: items[0]?.record || [],
			items: itemCount,
			totalPages: Math.ceil(items[0]?.count[0]?.count / limitNum) || 0,
		});
	},

	GetItemById: async function (req, res, next) {
		try {
			const item = await Item.findById(req.query._id);
			res.send({
				item: item,
			});

		} catch (err) {
			res.status(500).send({
				item: null,
			});
		}
	},

	// recently mint for user
	RecentlyMinted_composeNft_user: async function (req, res) {
		try {
			const address = req.query.id;
			const mintQut = req.query.mintqut ? +req.query.mintqut
				: 60;
			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 60;

			const page = req.query.page && parseInt(req.query.page)
				? parseInt(req.query.page)
				: 1;
			let skip = (page - 1) * limitNum;

			const query = {

				$and: [
					{ itemCollection: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
					{ 'attributes.trait_type': 'composed' },
					{ 'attributes.value': 'false' },
					{ 'holders.address': address }

				]


			};

			const pipeline = [
				{ $match: query },
				{ $sort: { timestamp: -1 } },
				{ $skip: skip },
				{ $limit: mintQut },
				{ $project: { __v: 0 } },
			];

			const items = await Item.aggregate(pipeline).exec();

			const count = await Item.countDocuments(query).exec();

			res.status(200).send({
				status: true,
				items: items,
				count: count,
			});
		} catch (err) {
			res.status(200).send({
				status: false,
				message: err.message,
			});
		}
	},

	// not on sell nft 

	NotOnSellNft: async function (req, res) {
		try {
			let items;
			const address = req.query.id;
			const queryType = req.query.type;
			const names = req.query.name;

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;

			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;
			// Total couts items
			const getCount = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};

			const allSellCount = await getCount({ $gt: 0 });
			const allNotSellCount = await getCount({ $size: 0 });

			// Dynamic sorting based on user's preference
			const sortField = req.query.sortField ? req.query.sortField : 'timestamp';
			const sortOrder = req.query.sortOrder ? (req.query.sortOrder.toLowerCase() === 'desc' ? -1 : 1) : -1;
			const sortStage = { $sort: { [sortField]: sortOrder } };


			let match = [];

			if (queryType === "All") {
				match = [
					{
						$match: {
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							marketList: { $size: 0 },
							...(names ? { name: { $in: names } } : {})
						},
					},
				];
			} else {
				match = [
					{
						$match: {
							"attributes.value": queryType,
							itemCollection:
								process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
							marketList: { $size: 0 },
							...(names ? { name: { $in: names } } : {})

						},
					},
				];
			}

			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				{ _id: 0, __v: 0 }
			).lean();

			items = await Item.aggregate([
				...match,
				sortStage,
				{
					$facet: {
						count: [
							{
								$match: {
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],
						totalTraitCount: [
							{
								$match: {
									$and: [
										{
											itemCollection:
												process.env.ITEM_COLLECTION_ADDRESS.toLowerCase()
										},
										{ 'attributes.trait_type': "composed" },
										{ 'attributes.value': "false" },


									]
								},
							},
							{
								$project: {
									_id: 1,
									name: 1,
									trait_type: {
										$arrayElemAt: [
											"$attributes.trait_type",
											0,
										],
									},
								},
							},
							{
								$group: {
									_id: "$trait_type",
									count: { $sum: 1 },
								},
							},
							{
								$sort: {
									_id: 1,
								},
							},
							{
								$project: {
									name: "$_id",
									count: "$count",
									_id: 0,
								},
							},
						],

						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},
			]);

			if (items.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
				});
			}

			res.send({
				// items,
				not_sell_count: allNotSellCount || 0,
				sell_count: allSellCount,
				items: items[0]?.record || [],
				totalTraitCount: items[0]?.totalTraitCount,
				collectionInfo: collection,
				totalPages: Math.ceil(items[0]?.count?.count / limitNum) || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error not sell" });
		}
	},

	NotOnSellNftFilter: async function (req, res) {
		try {
			let items;
			const { trait_type, type, limit, page, name } = req.query;
			let names = name
			const limitNum = limit ? Math.min(parseInt(limit), 60) : 12;
			const skip = (page && parseInt(page)) ? (parseInt(page) - 1) * limitNum : 0;
			const getCount = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					marketList: marketListCondition,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};

			const allSellCount = await getCount({ $gt: 0 });
			const allNotSellCount = await getCount({ $size: 0 });


			// Dynamic sorting based on user's preference
			const sortField = req.query.sortField ? req.query.sortField : 'timestamp';
			const sortOrder = req.query.sortOrder ? (req.query.sortOrder.toLowerCase() === 'desc' ? -1 : 1) : -1;
			const sortStage = { $sort: { [sortField]: sortOrder } };

			const itemCollectionAddress = process.env.ITEM_COLLECTION_ADDRESS.toLowerCase();

			const match = type === "All"
				? [{ $match: { itemCollection: itemCollectionAddress, 'attributes.trait_type': trait_type, marketList: { $size: 0 }, ...(names ? { name: { $in: names } } : {}) } }]
				: [{ $match: { "attributes.value": type, itemCollection: itemCollectionAddress, 'attributes.trait_type': trait_type, marketList: { $size: 0 }, ...(names ? { name: { $in: names } } : {}) } }];


			let collection = await ItemCollection.findOne(
				{ address: process.env.ITEM_COLLECTION_ADDRESS.toLocaleLowerCase() },
				{ _id: 0, __v: 0 }
			).lean();

			items = await Item.aggregate([
				...match,
				sortStage,
				{
					$facet: {
						count: [
							{
								$match: {
									itemCollection:
										process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
								},
							},
							{
								$count: "count",
							},
						],

						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count", // Flatten the count facet result
				},
			]);

			if (items.length === 0) {
				return res.status(200).send({
					message:
						"No items found for the specified address or type!",
				});
			}

			res.send({
				// items,
				not_sell_count: allNotSellCount,
				sell_count: allSellCount || 0,
				items: items[0]?.record || [],
				totalTraitCount: items[0]?.totalTraitCount,
				collectionInfo: collection,
				totalPages: Math.ceil(items[0]?.count?.count / limitNum) || 0,
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error not sell" });
		}
	},


	// Heart-Heads items
	HeartHeadsItems: async function (req, res) {
		let dataCount = await HeartHeadsItem.countDocuments()

		const updateField = (fieldName, data) => {
			if (!data || data.length === 0) {
				return {};
			}
			return { $push: { [fieldName]: { $each: data } } };
		};

		const deleteField = (fieldName) => {
			return { $pull: { [fieldName]: {} } };
		};

		const updateItem = async (itemId, query) => {
			if (itemId) {
				return await HeartHeadsItem.updateOne({ _id: itemId }, query);
			}
			return null;
		};

		const createItem = async (data) => {
			return await HeartHeadsItem.create(data);
		};

		let result;
		const {
			_id: itemId,
			fieldName: fieldNameToUpdate, // if update  field data pass this param and array of object data.
			delFieldName: deleteFieldData, // if delet field data pass this param and field name.
			...fieldData
		} = req.body;


		try {

			if (dataCount >= 1) return res.status(400).json({ message: 'can not create more than one record!' });


			if (itemId && deleteFieldData) {
				result = await updateItem(itemId, deleteField(deleteFieldData));
			} else if (itemId && fieldNameToUpdate) {
				result = await updateItem(itemId, updateField(fieldNameToUpdate, fieldData[fieldNameToUpdate]));
			} else {
				result = await createItem(fieldData);
			}

			res.status(200).json({ message: 'Records processed successfully' });
		} catch (error) {
			console.error('Error processing records:', error);
			res.status(500).json({ error: `Internal Server Error 1612 ${error}` });
		}

	},

	// all rarity item count
	RarityItemsCount: async function (req, res) {
		try {
			let result;
			const queryType = req.query.type;
			const rarity = req.query.rarity;

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 15;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;

			if (!queryType) return res.status(404).json({ msg: 'queryType not found!' })

			const heartheadsitemsCollection = await HeartHeadsItem.find({});

			result = heartheadsitemsCollection[0][queryType];

			if (rarity && rarity !== "All") {
				rarity_filtered = result.filter(item => item.rarity === rarity);
			} else {
				rarity_filtered = result;
			}

			const itemName = await Item.aggregate([
				{
					$match: {
						"itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(),
						"attributes.trait_type": queryType,
						"attributes.value": 'false'
					}
				},
				{
					$group: {
						_id: "$name",
						total: { $sum: 1 }
					}
				},
				{
					"$project": {
						"_id": 0,
						"name": "$_id",
						"count": "$total"
					}
				}
			]);
			let itemCount = []
			itemName.map((data) => {
				itemCount[data.name.trim()] = data.count
			})


			const resultArray = await Promise.all(rarity_filtered.map(async (item) => {
				const { image, name, quantity, rarity } = item;

				const minted = itemCount.hasOwnProperty(name.trim()) ? itemCount[name] : 0
				return {
					image,
					category: queryType,
					name,
					quantity,
					rarity,
					minted
				};
			}));

			const pageCount = rarity ? rarity_filtered.length : resultArray.length;

			const paginatedResult = resultArray.slice(skip, skip + limitNum);

			res.send({
				itemCount: rarity ? resultArray.length : result?.length,
				items: paginatedResult,
				totalPages: Math.ceil(pageCount / limitNum),
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}

	},



	// my voting power
	
	MyVotingPower: async function (req, res) {
		try {
			let items=[];
			let itemAllDataWithdrawAndDeposite=[];
			let depositeAll;
			let withdrawAll;
			let withdrawAllTokenId
			let depositeAllTokenId

			const address = req.query.id;
			let depositeFilter =req.query.deposite == 'yes'
			let withdrawFilter =req.query.withdraw == 'yes' // if pass yes then filter apply in withdraw nft
			let allitems =req.query.all == 'yes' // it return all deposite and withdraw nft 

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;

			let match = [];

			const userAddress = {
				"holders.address": address?.toLowerCase(),
			};
			
			match = [
				{
					$match: {
						...userAddress,
						itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
						'attributes.value': 'false',
					},
				},
			];

			const getCount = async (address) => {
				const query = {
					value: { $ne: 0 }
				};
			
				if (address) {
					query.account = address;
				}
			
				return await VoteBalance.countDocuments(query).exec();
			};
			const WithdrawNftCount = await getCount( address?.toLowerCase());
			const GlobalWithdrawNftCount = await getCount();

			const getCountGlobleNft = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};
			const GlobalNftCount = await getCountGlobleNft();

			// sortOptions = withdrawShort ? {"itemDeposits.timestamp": -1} : {timestamp: -1};
			if(depositeFilter){
			 items= await Item.aggregate([
					...match,
					{
						
						$lookup: {
							from: "votebalances",
							let: {
								tokenId:"$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$tokenId" , "$$tokenId"] }, 
												{ $ne: ["$value", 0] }
											]
										},
									},
								}
							],
							as: "itemDeposits",
						}
					},
					{
						$match: {
						  itemDeposits: { $eq: [] } // Filter out items with no matching vote balance
						}
					},
					{
						
						$unwind: {
							path: "$itemDeposits",
							preserveNullAndEmptyArrays: true
	
						},
							
					},
					{
						$facet: {
							count: [
								{
									$match: {
										"holders.address": address?.toLowerCase(),
										itemCollection:
											process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
									},
								},
								{
									$count: "count",
								},
							],
							
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",	
					},
					
	
				])
			}

			if(withdrawFilter){
				items = await VoteBalance.aggregate([
					{
						$match: {
							account: address?.toLowerCase(),
							value: { $ne: 0 }
						}
					},
					{
						$lookup: {
							from: "items",
							let: {
								tokenIdInt: "$tokenId", // Store the int32 tokenId from VoteBalance
								tokenIdStr: { $toString: "$tokenId" } // Convert tokenId to string for comparison
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$$tokenIdStr", "$tokenId"] }
											]
										},
									},
								},
								{
									$project:{
										itemCollection: 1,
										tokenId: 1,
										description: 1,
										image: 1,
										attributes: 1,
										name: 1
									}
								}
							],
							as: "itemDeposits",
						}
					},
					{
						$sort:{
							timestamp: -1
						}
					},
					{
						$unwind: {
							path: "$itemDeposits",
							// preserveNullAndEmptyArrays: true
						},
					},
					{
						$match: {
							"itemDeposits.itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(), // Check itemCollection against environment variable
						}
					},
					{
						$facet: {
							count: [
								{
									$match: {
										"account": address?.toLowerCase(),
										"itemDeposits.itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase()
									}
								},
								{
									$count: "count",
								},
							],
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",
					}
				])
				
			}
			if(allitems){
				
				let itemsdeposite= await Item.aggregate([
					...match,
					{
						
						$lookup: {
							from: "votebalances",
							let: {
								tokenId: "$tokenId",
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$tokenId", "$$tokenId"] }, 
												{ $ne: ["$value", 0] }
											]
										},
									},
								}
							],
							as: "itemDeposits",
						}
					},
					{
						$match: {
						  itemDeposits: { $eq: [] } // Filter out items with no matching vote balance
						}
					},
					{
						
						$unwind: {
							path: "$itemDeposits",
							preserveNullAndEmptyArrays: true
	
						},
							
					},
				])

			   let	itemsWithdraw=await VoteBalance.aggregate([
					{
						$match:{
							account:address?.toLowerCase(),
							value: { $ne: 0 }
						}
					},
					{
						$lookup: {
							from: "items",
								let: {
									tokenIdInt: "$tokenId", // Store the int32 tokenId from VoteBalance
									tokenIdStr: { $toString: "$tokenId" } // Convert tokenId to string for comparison
								  },
							
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$$tokenIdStr", "$tokenId"] } 
											]
										},
									},
								},
								{
									$project:{
										itemCollection:1,
										tokenId:1,
										description:1,
										image:1,
										attributes:1,
										name:1
									}
								}
								
							],
							as: "itemDeposits",
						}
					},
					{
						$sort:{
							timestamp:-1
						}
					},
					{
						
						$unwind: {
							path: "$itemDeposits",
							// preserveNullAndEmptyArrays: true
	
						},
							
					},
					{
						$match: {
							"itemDeposits.itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(), // Check itemCollection against environment variable
						}
					},
					
				])

				// concate data of itemsdeposite and itemsWithdraw then applying pagination
				itemAllDataWithdrawAndDeposite =[...itemsdeposite,...itemsWithdraw]
				
		    }

			// get withdraw all tokenId
			withdrawAll=await VoteBalance.aggregate([
				{
					$match:{
						account:address?.toLowerCase(),
						value: { $ne: 0 }
					}
				},
				{
					$project:{
						tokenId:1
					}
				}
			])
			// console.log('items[0]?.record?', items[0]?.record.length)
			// console.log('items', items[0]?.record?.map((d)=>d.tokenId))

			// get deposite all tokenId
			depositeAll= await Item.aggregate([
				...match,
				{
                  $project:{
					tokenId:1
				  }
				},
				{
					
					$lookup: {
						from: "votebalances",
						let: {
							tokenId: "$tokenId",
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ["$tokenId", "$$tokenId"] }, 
											{ $ne: ["$value", 0] }
										]
									},
								},
							}
						],
						as: "itemDeposits",
					}
				},
				{
					$match: {
					  itemDeposits: { $eq: [] } // Filter out items with no matching vote balance
					}
				},
				{
					
					$unwind: {
						path: "$itemDeposits",
						preserveNullAndEmptyArrays: true

					},
						
				}

			])

			// total deposite item
			let totalItemNft = await Item.aggregate([...match])?.count('count');

		    depositeAllTokenId=depositeAll?.map(item=> item.tokenId)

			withdrawAllTokenId=withdrawAll?.map(item => item.tokenId)
			console.log('depositeAllTokenId,withdrawAllTokenId', depositeAllTokenId?.length,withdrawAllTokenId?.length)
			let TotalWithdrawDepositeNft=[... withdrawAll,...depositeAll].length

			
			
			
			let record	= allitems ? itemAllDataWithdrawAndDeposite?.slice(skip, skip + limitNum) : items[0]?.record  || 0
			let pagination =allitems ? Math.ceil(itemAllDataWithdrawAndDeposite?.length / limitNum) :  Math.ceil(items[0]?.count?.count / limitNum) || 0
			let withdraw=WithdrawNftCount
			let TotalDeposited= `${withdraw}/${TotalWithdrawDepositeNft}`
			let TotalDepositedPercen= +`${((withdraw/(TotalWithdrawDepositeNft))*100).toFixed(1)}`
			
			
			res.send({
				WithdrawNftCount,
				TotalDeposited,
				TotalDepositedPercen,
				GlobalWithdrawNftCount,
				GlobalNftCount,
				count:allitems?itemAllDataWithdrawAndDeposite?.length: items[0]?.count?.count || 0 ,
				withdrawAllTokenId,
				depositeAllTokenId,
				items: record || [],          
				totalPages: pagination || 0, 

			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}
	},

	// propasal list
	PropasalList:async function(req,res){
		// const currentBlock=18737687
		const currentBlock = await provider?.getBlockNumber();
		try{
			let items;
			let totalDocumentRecords
			let isProposal =req.query.is_proposal=='yes'
			let isMember =req.query.is_member=='yes'
			let isActive =req.query.is_active=='yes'
			let isClose =req.query.is_close=='yes'



	
			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 5;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;

			let skip = (page - 1) * limitNum;
		
			// check proposal isActive or isClose 
           if(isActive || isClose){
			const proposalMatch = {
				value: { $ne: 0 },
				isSynced:true
			  };

			  if (isActive) {
				proposalMatch.voteEnd = { $gt: currentBlock };
			  } else if (isClose) {
				proposalMatch.voteEnd = { $lt: currentBlock };
			  }

			  const totalCountPipeline = [
				{ $match: proposalMatch },
				{
				  $count: "count"
				}
			  ];
			  
			  items = await Proposal.aggregate([
				{ $match: proposalMatch },
				{
				  $project: {
					timestamp: 1,
					proposalId: 1,
					proposer: 1,
					voteStart: 1,
					voteEnd: 1,
					title: 1,
					description: 1,
					yesCount: 1,
					noCount: 1,
					abstainCount: 1,
					createdTimestamp: 1,
					discussionUrl:1
				  }
				},
				{
				  $sort: {
					createdTimestamp: -1
				  }
				},
				{ $skip: skip },
				{ $limit: limitNum },
			  ]);
			 const totalDocCount = await Proposal.aggregate(totalCountPipeline);
			 totalDocumentRecords=totalDocCount[0]?.count
		   }
		
		   // get proposal list
           if(isProposal){
				const proposalMatch = {
					value: { $ne: 0 },
					isSynced:true
				};

			   items = await Proposal.aggregate([
				   { $match: proposalMatch },
				   {
					   $project:{
						   timestamp:1,
						   proposalId:1,
						   proposer:1,
						   voteStart:1,
						   voteEnd:1,
						   title:1,
						   description:1,
						   yesCount:1,
						   noCount:1,
						   abstainCount:1,
						   createdTimestamp:1,
						   isSynced:1,
						   discussionUrl:1,
						   image:1
					   }
				   },
				   {
					$sort:{
						createdTimestamp:-1
					}
				   },
				   { $skip: skip },
				   { $limit: limitNum },
				   
			   ])
			   totalDocumentRecords = await Proposal.countDocuments(proposalMatch);

		   }

		   // get ismamber history.
		   if(isMember){

				items = await VoteBalance.aggregate([
					
					{
						$group: {
							_id: "$account", // Group by the account field
							totalValue: { $sum: "$value" }, // Calculate the sum of values for each account
							timestamp: { $last: "$timestamp" }
						}
					},
					{
						$sort:{
							timestamp:-1
						}
					},
					{
						$project: {
							_id: 0,
							account: "$_id", // Rename the _id field to account
							totalValue: 1,
							timestamp: 1,
						}
					},
					{ $skip: skip },
					{ $limit: limitNum }
				])

				const countQuery = [
					{
						$group: {
							_id: "$account" // Group by the account field
						}
					},
					{
						$count: "totalDocuments"
					}
				];
				
				const totalVoteBalanceDocuments = await VoteBalance.aggregate(countQuery);
				totalDocumentRecords = totalVoteBalanceDocuments.length > 0 ? totalVoteBalanceDocuments[0].totalDocuments : 0;


		   }


		const countQuery = [
			{
				$group: {
					_id: "$account"
				}
			},
			{
				$count: "totalDocuments"
			}
		];
		
		const totalMembers = await VoteBalance.aggregate(countQuery);
		
		// add field yes,no,abtrain count in parcentage in items data
		  let itemsData=[]
			for (let i = 0; i < items.length; i++) {
				let totalVote = items[i].yesCount + items[i].noCount + items[i].abstainCount;
				items[i].totalVote = totalVote ;
				let yesCountPercentage=items[i].yesCount/totalVote
				let noCountPercentage=items[i].noCount/totalVote
				let abstainCountPercentage=items[i].abstainCount/totalVote

				items[i].yesCountPercentage= +(yesCountPercentage*100).toFixed(1)
				items[i].noCountPercentage= +(noCountPercentage*100).toFixed(1)
				items[i].abstainCountPercentage= +(abstainCountPercentage*100).toFixed(1)

				itemsData.push(items[i])
			}

			const existingProposal = await Proposal.findOne({ proposalId:"81687554485735043926181727189340888793642644211488900478892408027015877080220" });
		    console.log('existingProposal', existingProposal)
			// Calculate total count of record
			let totalPages=Math.ceil(totalDocumentRecords / limitNum) || 0
			res.send({
				count:totalDocumentRecords || 0,
				totalMembers:totalMembers[0].totalDocuments||0,
				items: itemsData || [],
				totalPages:totalPages || 0
			})

		}catch(error){
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}

	},

	// get propasal particular data
	PropasalData:async function(req,res){

		try{
			let items;
			let recentCreted_items;
			let proposalId=req.query.id
			let limitNum = req.query.limit
				? 4
				: 4;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;

			let skip = (page - 1) * limitNum;
		
			const proposalMatch = {
				value: { $ne: 0 }
			};

			

			items = await Proposal.aggregate([
				{ $match:
					 {
					proposalId: proposalId ,
				     value: { $ne: 0 },
				}
			    },
				{
					$project:{
						timestamp:1,
						proposalId:1,
						proposer:1,
						voteStart:1,
						voteEnd:1,
						title:1,
						description:1,
						yesCount:1,
						noCount:1,
						abstainCount:1,
						createdTimestamp:1,
						discussionUrl:1,
						image:1
					}
				},
			])
 
			
		   recentCreted_items = await Proposal.aggregate([
			   { $match: proposalMatch },
			   {
				   $project:{
					   timestamp:1,
					   proposalId:1,
					   proposer:1,
					   voteStart:1,
					   voteEnd:1,
					   title:1,
					   description:1,
					   yesCount:1,
					   noCount:1,
					   abstainCount:1,
					   createdTimestamp:1,
					   discussionUrl:1,
					   image:1
				   }
			   },
			   {
				$sort:{
					createdTimestamp:-1
				}
			   },
			   { $skip: skip },
			   { $limit: limitNum }
		   ])

			// add field yes,no,abtrain count in parcentage in recentCreted_items data
		   let propasalData=[]
           for (let i = 0; i < recentCreted_items.length; i++) {
			if(items[0].proposalId != recentCreted_items[i].proposalId){
				let totalVote = recentCreted_items[i].yesCount + recentCreted_items[i].noCount + recentCreted_items[i].abstainCount;
                recentCreted_items[i].totalVote = totalVote;
				let yesCountPercentage=recentCreted_items[i].yesCount/totalVote
				let noCountPercentage=recentCreted_items[i].noCount/totalVote
				let abstainCountPercentage=recentCreted_items[i].abstainCount/totalVote

				recentCreted_items[i].yesCountPercentage= +(yesCountPercentage*100).toFixed(1)
				recentCreted_items[i].noCountPercentage= +(noCountPercentage*100).toFixed(1)
				recentCreted_items[i].abstainCountPercentage= +(abstainCountPercentage*100).toFixed(1)

				propasalData.push(recentCreted_items[i])
			}
		    }

			// add field yes,no,abtrain count in parcentage in items data
            let itemsData=[]
			for (let i = 0; i < items.length; i++) {
				let totalVote = items[i].yesCount + items[i].noCount + items[i].abstainCount;
				items[i].totalVote = totalVote ;
				let yesCountPercentage=items[i].yesCount/totalVote
				let noCountPercentage=items[i].noCount/totalVote
				let abstainCountPercentage=items[i].abstainCount/totalVote

				items[i].yesCountPercentage= +(yesCountPercentage*100).toFixed(1)
				items[i].noCountPercentage= +(noCountPercentage*100).toFixed(1)
				items[i].abstainCountPercentage= +(abstainCountPercentage*100).toFixed(1)

				itemsData.push(items[i])
			}
			
		   if (items.length === 0) {
			return res.status(200).send({
				message:
				"No items found!",
			});
			}
			// Calculate total count of record

			res.send({
				items: itemsData || [],
				recently_created_proposal:propasalData || []
			
			})

		}catch(error){
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}

	},

	// Vote history
	VoteHistory:async function(req,res){
 
		try{
			let items;
			let proposalID = req.query.id

			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;

			let skip = (page - 1) * limitNum;

			items =await VoteCast.aggregate([
				{
					$match:{
						proposalId:proposalID,
						power: { $ne: 0 },
					}
				},
				{
					$project:{
						voteCastId:1,
						timestamp:1,
						voter:1,
						proposalId:1,
						support:1,
						power:1
					}
				},
				{
					$lookup: {
						from: "proposals",
						let: {
							proposalId: '$proposalId',
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: ['$proposalId', "$$proposalId"] },
										]
									},
								},
							},
							{
								$project:{
									proposalId:1,
									proposer:1,
									title:1,
									description:1,
									yesCount:1,
									noCount:1,
									abstainCount:1

								}
							}
						],
						as: "proposalDetail",
					},
					
				},
				{
					$sort: {timestamp:-1} // Sort after $lookup
				},
				{
					$unwind: {
						path: "$proposalDetail",
					},
				},
				{
					$facet: {
						count: [
							{
								$count: "count",
							},
						],
						
						record: [
							{
								$skip: skip, // Skip a certain number of documents based on the current page
							},
							{
								$limit: limitNum, // Limit the number of documents per page
							},
						],
					},
				},
				{
					$unwind: "$count",	
				},
			])


			

            let count=items[0]?.count?.count
			let record	=items[0]?.record || 0
			let totalPages =Math.ceil(items[0]?.count?.count / limitNum)

			res.send({
				count,
				items: record || [],
				totalPages
			})

		}catch(error){
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}
	},

	// create proposal 
	CreateProposal: async function(req, res) {
		try {
		  const { proposalId, discussionUrl } = req.body;
		  // Check if req.file exists (i.e., if an image was uploaded)
		  const image = req.file ? req.file.location : null;
		  const proposal = new Proposal({
			proposalId,
			discussionUrl,
			image
		  });
		  const savedProposal = await proposal.save();
		  res.status(200).json({ message: "Proposal created successfully!", savedProposal });
		} catch (error) {
		  // Log the error for debugging purposes
		  console.error("Error creating proposal:", error);
		  res.status(500).json({ message: "Internal server error", error: error.message });
		}
	},

	// reward staking 

	RewardStaking: async function (req, res) {
		try {
			let items = [];
			let itemAllStakAndUnStack = [];
			let stakeAll;
			let unStakeAll;
			let unstakeAllTokenId
			let stakeAllTokenId
	
			const address = req.query.id;
			let stakeFilter = req.query.stacke == 'yes'
			let unstakeFilter = req.query.unstake == 'yes'
			let allitems = req.query.all == 'yes' // it return all staked and unStaked nft 
			const queryType = req.query.type;
	
			let limitNum = req.query.limit
				? Math.min(parseInt(req.query.limit), 60)
				: 12;
			const page =
				req.query.page && parseInt(req.query.page)
					? parseInt(req.query.page)
					: 1;
			let skip = (page - 1) * limitNum;
	
			let match = [];
	
			const userAddress = {
				"holders.address": address?.toLowerCase(),
			};

			if (queryType === 'All') {
				match = [
					{
						$match: {
							...userAddress,
							itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
							'attributes.value': 'false',
						},
					},
				];
			}
			else {
				match = [
					{
						$match: {
							...userAddress,
							itemCollection: process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
							'attributes.value': 'false',
							"attributes.value": queryType
						},
					},
				];
			}
	
			let stakersClamed= await HhStackers.aggregate([
				{
					$match:{
						account:address?.toLowerCase()
					}
				},
				{
					$project:{
						account:1,
						claimed:1,
						_id:0
					}
				}
			])

			let currenTokenRate= await Token.aggregate([
				{
					$match:{
						address:PLSRare?.toLowerCase()
					}
				}
			])

			const getCount = async (address) => {
				const query = {
					value: { $ne: 0 }
				};
	
				if (address) {
					query.account = address;
				}
	
				return await HhStakingBalance.countDocuments(query).exec();
			};
			const unstakeNftCount = await getCount(address?.toLowerCase());
			const GlobalUnStakedNftCount = await getCount();
	
			const getCountGlobleNft = async (marketListCondition) => {
				const query = {
					itemCollection: process.env.ITEM_COLLECTION_ADDRESS,
					"attributes.value": 'false'
				};
				return await Item.countDocuments(query).exec();
			};
			const GlobalNftCount = await getCountGlobleNft();
	
			if (stakeFilter) {
				items = await Item.aggregate([
					...match,
					{
	
						$lookup: {
							from: "hhstakingbalances",
							let: {
								tokenId: "$tokenId" ,
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$tokenId", "$$tokenId"] },
												{ $ne: ["$value", 0] }
											]
										},
									},
								}
							],
							as: "itemstake",
						}
					},
					{
						$match: {
							itemstake: { $eq: [] } // Filter out items with no matching vote balance
						}
					},
					{
	
						$unwind: {
							path: "$itemstake",
							preserveNullAndEmptyArrays: true
	
						},
	
					},
					{
						$facet: {
							count: [
								{
									$match: {
										"holders.address": address?.toLowerCase(),
										itemCollection:
											process.env.ITEM_COLLECTION_ADDRESS?.toLowerCase(),
									},
								},
								{
									$count: "count",
								},
							],
	
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",
					},
	
				])
			}
			if (unstakeFilter) {
				items = await HhStakingBalance.aggregate([
					{
						$match: {
							account: address?.toLowerCase(),
							value: { $ne: 0 }
						}
					},
					{
						$lookup: {
							from: "items",
							let: {
									tokenIdInt: "$tokenId", // Store the int32 tokenId from VoteBalance
									tokenIdStr: { $toString: "$tokenId" } // Convert tokenId to string for comparison
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$$tokenIdStr", "$tokenId"] }
											]
										},
									},
								},
								{
									$project: {
										itemCollection:1,
										tokenId: 1,
										description: 1,
										image: 1,
										attributes: 1,
										name: 1
									}
								}
	
							],
							as: "itemstake",
						}
					},
					{
						$sort: {
							timestamp: -1
						}
					},
					{
	
						$unwind: {
							path: "$itemstake",
							// preserveNullAndEmptyArrays: true
	
						},
	
					},
					{
						$match: {
							"itemstake.itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(), // Check itemCollection against environment variable
						}
					},
					{
						$project: {
							_id: 1,
							isSynced: 1,
							StakeBalanceId: 1,
							timestamp: 1,
							tokenId: 1,
							account: 1,
							value: 1,
							createdTimestamp: 1,
							name: "$itemstake.name",
							description: "$itemstake.description",
							image: "$itemstake.image",
							attributes: "$itemstake.attributes",
							itemCollection: "$itemstake.itemCollection",

							__v: 1,
	
						}
					},
					{
						$match: {
							"attributes.value": queryType === 'All' ? 'false' : queryType
						}
					},
					{
						$facet: {
							count: [
								{
									$match: {
										"account": address?.toLowerCase(),
							            "itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(), // Check itemCollection against environment variable

									}
								},
								{
									$count: "count",
								},
							],
	
							record: [
								{
									$skip: skip, // Skip a certain number of documents based on the current page
								},
								{
									$limit: limitNum, // Limit the number of documents per page
								},
							],
						},
					},
					{
						$unwind: "$count",
					},
	
	
	
				])
			}
			if (allitems) {
	
				let itemsStake = await Item.aggregate([
					{
	
						$lookup: {
							from: "hhstakingbalances",
							let: {
								tokenId: "$tokenId" ,
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: [ "$tokenId", "$$tokenId"] },
												{ $ne: ["$value", 0] }
											]
										},
									},
								}
							],
							as: "itemstake",
						}
					},
					{
						$match: {
							itemstake: { $eq: [] } // Filter out items with no matching vote balance
						}
					},
					{
	
						$unwind: {
							path: "$itemstake",
							preserveNullAndEmptyArrays: true
	
						},
	
					},
					...match,
	
				])
	
				let itemsUnStake = await HhStakingBalance.aggregate([
					{
						$match: {
							account: address?.toLowerCase(),
							value: { $ne: 0 }
						}
					},
					{
						$lookup: {
							from: "items",
							let: {
								tokenIdInt: "$tokenId", // Store the int32 tokenId from VoteBalance
								tokenIdStr: { $toString: "$tokenId" } // Convert tokenId to string for comparison
						},
							pipeline: [
								{
									$match: {
										$expr: {
											$and: [
												{ $eq: ["$$tokenIdStr", "$tokenId"] }
											]
										},
									},
								},
								{
									$project: {
										itemCollection:1,
										tokenId: 1,
										description: 1,
										image: 1,
										attributes: 1,
										name: 1
									}
								}
	
							],
							as: "itemstake",
						}
					},
					{
						$sort: {
							timestamp: -1
						}
					},
					{
	
						$unwind: {
							path: "$itemstake",
							// preserveNullAndEmptyArrays: true
	
						},
	
					},
					{
						$match: {
							"itemstake.itemCollection": process.env.ITEM_COLLECTION_ADDRESS.toLowerCase(), // Check itemCollection against environment variable
						}
					},
					{
						$project: {
							_id: 1,
							isSynced: 1,
							StakeBalanceId: 1,
							timestamp: 1,
							tokenId: 1,
							account: 1,
							value: 1,
							createdTimestamp: 1,
							name: "$itemstake.name",
							description: "$itemstake.description",
							image: "$itemstake.image",
							attributes: "$itemstake.attributes",
							__v: 1,
	
						}
					},
					{
						$match: {
							"attributes.value": queryType === 'All' ? "false" : queryType
						}
					},
	
				])
	
				// concate data of itemsdeposite and itemsWithdraw then applying pagination
				itemAllStakAndUnStack = [...itemsStake, ...itemsUnStake]
	
			}
	
	
			// get unStakeAll all tokenId
			unStakeAll = await HhStakingBalance.aggregate([
				{
					$match: {
						account: address?.toLowerCase(),
						value: { $ne: 0 }
					}
				},
				{
					$project: {
						tokenId: 1
					}
				}
			])
	
			// get stakeAll all tokenId
			stakeAll = await Item.aggregate([
				...match,
				{
					$project: {
						tokenId: 1
					}
				},
				{
	
					$lookup: {
						from: "hhstakingbalances",
						let: {
							tokenId: { $toInt: "$tokenId" },
						},
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [
											{ $eq: [{ $toInt: "$tokenId" }, "$$tokenId"] },
											{ $ne: ["$value", 0] }
										]
									},
								},
							}
						],
						as: "itemstake",
					}
				},
				{
					$match: {
						itemstake: { $eq: [] } // Filter out items with no matching vote balance
					}
				},
				{
	
					$unwind: {
						path: "$itemstake",
						preserveNullAndEmptyArrays: true
	
					},
	
				}
	
			])
	
			// total staked item
	
			stakeAllTokenId = stakeAll?.map(item => item.tokenId)
	
			unstakeAllTokenId = unStakeAll?.map(item => item.tokenId)
			let TotalStakUnStackNft = [...unStakeAll, ...stakeAll].length
	
	
	
	
			let record = allitems ? itemAllStakAndUnStack?.slice(skip, skip + limitNum) : items[0]?.record || 0
			let pagination = allitems ? Math.ceil(itemAllStakAndUnStack?.length / limitNum) : Math.ceil(items[0]?.count?.count / limitNum) || 0
			let unStaked = unstakeNftCount
			let TotalStaked = `${unStaked}/${TotalStakUnStackNft}`
			let TotalStakedPercen = +`${((unStaked / (TotalStakUnStackNft)) * 100).toFixed(1)}`
			let GlobalStakPercen=  +(GlobalUnStakedNftCount/(GlobalNftCount+GlobalUnStakedNftCount)*100).toFixed(1)
		
			res.send({
				unstakeNftCount,
				TotalStaked,
				TotalStakedPercen,
				GlobalUnStakedNftCount,
				GlobalNftCount,
				GlobalStakPercen,
				count: allitems ? itemAllStakAndUnStack?.length : items[0]?.count?.count || 0,
				stakersClamed:stakersClamed[0]?.claimed,
				currenPLSTokenRate:currenTokenRate[0]?.rate,
				unstakeAllTokenId,
				stakeAllTokenId,
				items: record || [],
				totalPages: pagination || 0,
	
			});
		} catch (error) {
			console.error(error);
			res.status(500).json({ message: "Internal server error" });
		}
	},
	  
	// compitition contest list
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
			console.log('contest_lists', error)
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
});
