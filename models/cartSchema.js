const mongoose = require('mongoose')
const { Schema } = mongoose

const cartSchema = new Schema({
  userID: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  item: [{
    productID: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      default: 1
    },
    price: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      default: 'Placed'
    },
    cancelationReason: {
      type: String,
      default: 'none'
    }

  }]
})

const Cart = mongoose.model('Cart',cartSchema)

module.exports = Cart