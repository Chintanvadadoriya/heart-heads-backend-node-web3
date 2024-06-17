const mongoose = require('mongoose');
const { Schema } = mongoose;

const VoteBalanceSchema = new Schema({
  VoteBalanceId: { type: String },
  timestamp: { type: Number },
  tokenId: { type: Number,index:true },
  account: { type: String,index:true }, 
  value: { type: Number },
  isSynced: { type: Boolean, default: false },
  createdTimestamp: { type: Number,index: true },
});

const VoteBalance = mongoose.model('VoteBalance', VoteBalanceSchema);

module.exports = VoteBalance;
