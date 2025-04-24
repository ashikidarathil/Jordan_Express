const mongoose = require('mongoose')
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    sparse: true
  },
  // phone: {
  //   type: String,
  //   required: false,
  //   unique: true,
  //   sparse: true,
  //   default: null
  // },
  phone: {
    type: String,
    required: false,
    default: null
  },
  googleID: {
    type: String,
    unique:true
  },
  password: {
    type: String,
    required: false
  },
  isBlocked: {
    type: Boolean,
    default: false

  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: 'Cart'
  }],
  wallet: {
    type: Number,
    default: 0
  },
  wishlist: [{
    type: Schema.Types.ObjectId,
    ref: 'Wishlist'
  }],
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }],
  createdOn: {
    type: Date,
    default: Date.now
  },
 referralCode: {
    type: String,
    unique: true
  },
  redeemed: {
    type: Boolean,
    default: false
  },
  redeemedUser: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referredUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  searchHistory: [{
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category'
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      default: Date.now
    }
  }]
})

const User = mongoose.model('User', userSchema)

module.exports = User;

