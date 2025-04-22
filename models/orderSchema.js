// models/orderSchema.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid'); 


const orderSchema = new Schema({
  userID: { 
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true 
  },
  orderID: {
    type: String,
    default:() => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`, 
    unique: true
  },
  orderItems: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min:1
    },
    size: {  // Add this field
      type: String,
      required: true,
      enum: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10']
    },
    price: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      default: 'Pending',
      enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled', 'Returned','Return Request', 'Return Rejected']
    },
    cancellationReason: String,
    returnReason: String,
    
  }],
  cancellationReason: String,
  returnReason: String,
  totalPrice: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  address: { 
    label: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: Number, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true }
  },
  invoiceNumber: {
    type: String,

  },
  couponCode: {
    type: String,
    default: null
  },
  createdOn: {
    type: Date,
    default: Date.now, 
    required: true
  },
  couponApplied: {
    type: Boolean,
    default: false
  },

  paymentMethod: {
    type: String,
    required: true,
    enum: ['COD', 'Razorpay', 'Wallet'] 
  },
  paymentStatus: {
    type: String,
    default: 'Pending',
    enum: ['Pending', 'Paid', 'Failed']
  },
  walletAmount: { 
    type: Number,
    default: 0
  },
  deliveryCharge: { 
    type: Number,
    default: 0
  },
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;