const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
    timestamp: { type: Number },
    blockNumber: { type: Number },
    proposalId: { type: String,index: true }, // require index
    proposer: { type: String }, 
    values: [{ type: Number,  }],
    signatures: [{ type: String  }],
    calldatas: [{ type: String }],
    voteStart: { type: Number },
    voteEnd: { type: Number },
    description: { type: String,index: true },
    title: { type: String },
    status: { type: String },
    yesCount: { type: Number },
    noCount: { type: Number },
    abstainCount: { type: Number },
    isSynced: { type: Boolean, default: false },
    createdTimestamp: { type: Number,index: true },
    discussionUrl: { type: String },
    image: String, //proposal image

});

const Proposal = mongoose.model('proposal', proposalSchema);

module.exports = Proposal;
