const mongoose = require('mongoose');
const { Schema } = mongoose;

const HhStakingBalanceSchema = new Schema({
  StakeBalanceId: { type: String },
  timestamp: { type: Number },
  tokenId: { type: Number,index:true },
  account: { type: String,index:true }, 
  value: { type: Number },
  isSynced: { type: Boolean, default: false },
  createdTimestamp: { type: Number,index: true },
});

const HhStakingBalance = mongoose.model('hhstakingbalance', HhStakingBalanceSchema);

module.exports = HhStakingBalance;
