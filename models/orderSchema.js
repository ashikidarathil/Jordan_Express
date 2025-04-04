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
    default: uuidv4, 
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
      required: true
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
    returnReason: String
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
  address: { // Embedding address instead of ObjectId to match your intent
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
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Partially Cancelled', 'Returned', 'Partially Returned'],
    default: 'Pending'
  },
  createdOn: {
    type: Date,
    default: Date.now, // Corrected 'deafult' to 'default'
    required: true
  },
  couponApplied: {
    type: Boolean,
    default: false
  },
  paymentMethod: { // Added to store payment method from frontend
    type: String,
    required: true
  }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;