const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContestPreviousWinnersListSchema = new Schema({
    account: {type: String, lowercase: true}, //user address
    instructions: {
        type: String,
        index: true
    },
    startdate:
        { type: Number },
    enddate:
        { type: Number },
    winningprize: {
        type: String,
    },
    timestamp: { type: Number },
});

const HhContestPreviousWinnersList = mongoose.model('hhcontestpreviouswinners', ContestPreviousWinnersListSchema);
module.exports = HhContestPreviousWinnersList

