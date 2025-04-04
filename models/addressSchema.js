const mongoose = require('mongoose')
const { Schema } = mongoose

const addressSchema = new Schema({
  userID: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    unique: true
  },
  address: [{
    label: {
      type: String,
      required: true
    },
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: Number,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    // altPhone: {
    //   type: String,
    //   required: true
    // }
  }]

})

const Address = mongoose.model('Address',addressSchema) 

module.exports = Address