const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    brand: {
      type: String,
      required: true
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    regularPrice: {
      type: Number,
      required: true
    },
    salePrice: {
      type: Number,
      required: true
    },
    productOffer: {
      type: Number,
      default: 0
    },
    createdAt:{
      type:Date,
      deafult:Date.now,
    },
    size: [
      {
        size: {
          type: String,
          required: true,
          enum: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'] // Allowed sizes
        },
        quantity: {
          type: Number,
          required: true,
          min: 0 // Ensure quantity is non-negative
        }
      }
    ],
    color: {
      type: String,
      required: true
    },
    isListed: {
      type: Boolean,
      default: true
    },
    productImage: {
      type: [String],
      required: true
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['Available', 'Out of Stock', 'Discontinued'],
      required: true,
      default: 'Available'
    }
  },
  { timestamps: true }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;