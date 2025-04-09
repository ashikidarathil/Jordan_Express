const productModel = require('../../models/productSchema');
const categoryModel = require("../../models/categorySchema");
const userModel = require('../../models/userSchema')



const productDetails = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login'); 
    }
    const user = req.session.user
    const userData = await userModel.findOne({ _id: user });

    
    const productId = req.query.id;
    if (!productId) {
      return res.redirect('/pageNotFound'); 
    }

    
    const product = await productModel.findById(productId).populate('category');
    if (!product) {
      return res.redirect('/pageNotFound'); 
    }

    const findCategory = product.category;

 
    const similarProducts = await productModel
      .find({
        category: findCategory._id, 
        _id: { $ne: productId },
        isListed:true,
        isBlocked:false
      })
      .limit(4); 


    res.render('product-detail', {
      product: product,
      user: userData,
      category: findCategory,
      similarProducts: similarProducts, 
    });

  } catch (error) {
    console.log('Error fetching product details:', error);
    res.redirect('/pageNotFound');
  }
};



module.exports = {
  productDetails
}