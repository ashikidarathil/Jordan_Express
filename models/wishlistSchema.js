const mongoose = require('mongoose')
const {Schema} = mongoose

const wishlistSchema = new Schema({
  userID:{
    type:Schema.Types.ObjectId,
    ref:'User',
    required:true
  },
  products:[{
    productId:{
      type:Schema.Types.ObjectId,
      ref:'Product',
      required:true 
    },
    addOn:{
      type:Date,
      default:Date.now
    }
  }]
})


const Wishlist = mongoose.model('Wishlist',wishlistSchema)

module.exports = Wishlist