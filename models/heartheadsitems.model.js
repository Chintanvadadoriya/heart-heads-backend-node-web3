const mongoose = require('mongoose');
var Schema = mongoose.Schema;

const itemSchema = new Schema({
  image: String,
  category: String,
  name: String,
  quantity: Number,
  rarity: String,
});

const heartHeadsItem = new mongoose.Schema({
  background: [itemSchema],
  base: [itemSchema],
  clothes: [itemSchema],
  earrings: [itemSchema],
  hat: [itemSchema],
  necklace: [itemSchema],
  sunglasses: [itemSchema],
});

module.exports = mongoose.model('heartheadsitem', heartHeadsItem);

