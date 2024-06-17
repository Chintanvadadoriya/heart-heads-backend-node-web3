const mongoose = require('mongoose');
const { Schema } = mongoose;

const VoteCastSchema = new Schema({
  voteCastId: { type: String },
  timestamp: { type: Number },
  blockNumber: { type: Number },
  voter: { type: String,index:true }, 
  proposalId: { type: String,index:true },
  support: { type: Number },  
  power: { type: Number },
  reason: { type: String },
  params: { type: String } ,
  isSynced: { type: Boolean, default: false },
  createdTimestamp: { type: Number,index: true },
});

const VoteCast = mongoose.model('VoteCast', VoteCastSchema);

module.exports = VoteCast;
