const mongoose = require('mongoose')
const { Schema } = mongoose
const { u4: uuidv4 } = require('uuid')

const orderSchema = new Schema({
  orderID: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  orderItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity:{
      type:Number,
      required:true
    },
    price:{
      type:Number,
      deafult:0
    }
  }],
  totalPrice:{
    type:Number,
    required:true
  },
  discount:{
    type:Number,
    default:0
  },
  finalAmount:{
    type:Number,
    required:true
  },
  address:{
    type:Schema.Types.ObjectId,
    ref:"User",
    required:true
  },
  invoiceDate:{
    type:Date,
  },
  status:{
    type:String,
    required:true,
    enum:['Pending','Proccessing','Shipped','Delivered','Cancelled','Return Request','Returned']
  },
  createdOn:{
    type:Date,
    deafult:Date.now,
    required:true
  },
  couponApplied:{
    type:Boolean,
    default:false
  }

})

const Order = mongoose.model('Order',orderSchema)

module.exports = Order