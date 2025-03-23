const mongoose = require ('mongoose')
const {Schema} = mongoose

const categorySchema = new Schema({
  name:{
    type:String,
    required:true,
    unique:true
  },
  isDeleted: {
    type: Boolean,
    default: false, // Default to false (not deleted)
  },
  description:{
    type:String,
    required:true
  },
  isListed:{
    type:Boolean,
    default:true
  },
  categoryOffer:{
    type:Number,
    default:0
  },
  createdAt:{
    type:Date,
    default:Date.now
  },
  isBlock:{
    type:Boolean,
    default:false
  }

},{ timestamps: true })

const Category = mongoose.model('Category',categorySchema)

module.exports = Category