const mongoose = require('mongoose');

const hhstakersSchema = new mongoose.Schema({
    account: {type: String, lowercase: true}, //user address
    claimed: String,
});
hhstakersSchema.index({ account: 1 }, { unique: true });
const HhStackers = mongoose.model('hhstakers', hhstakersSchema);

module.exports = HhStackers;