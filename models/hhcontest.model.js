const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const WinnerSchema = new Schema({
    account: { type: String, index: true },
    entries: { type: Number },
    totalMinted: { type: Number }

   
});

const ContestSchema = new Schema({
    instructions: {
        type: String,
        index: true
    },
    startdate:
        { type: Number },
    enddate:
        { type: Number },
    winningprice: {
        type: String,
    },
    number_of_winners: {
        type: Number,
    },
    prize_image: String, //prize image
    winners: [WinnerSchema],
    timestamp: { type: Number },
});

const HhContest = mongoose.model('hhcontest', ContestSchema);
module.exports = HhContest

