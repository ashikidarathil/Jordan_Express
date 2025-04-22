const productModel = require('../../models/productSchema');
const categoryModel = require("../../models/categorySchema");
const userModel = require('../../models/userSchema')



const productDetails = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    const user = req.session.user;
    const userData = await userModel.findOne({ _id: user });

    const productId = req.query.id;
    if (!productId) {
      return res.redirect('/pageNotFound');
    }

    const product = await productModel.findById(productId).populate('category').lean();
    if (!product) {
      return res.redirect('/pageNotFound');
    }

    // Calculate discount percentage
    const discountPercentage = product.regularPrice > product.salePrice
      ? Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100)
      : 0;
    product.discountPercentage = discountPercentage;

    const findCategory = product.category;

    const similarProducts = await productModel
      .find({
        category: findCategory._id,
        _id: { $ne: productId },
        isListed: true,
        isBlocked: false
      })
      .limit(4)
      .lean();


    const enhancedSimilarProducts = similarProducts.map(similarProduct => {
      const discountPercentage = similarProduct.regularPrice > similarProduct.salePrice
        ? Math.round(((similarProduct.regularPrice - similarProduct.salePrice) / similarProduct.regularPrice) * 100)
        : 0;
      return { ...similarProduct, discountPercentage };
    });

    res.render('product-detail', {
      product: product,
      user: userData,
      category: findCategory,
      similarProducts: enhancedSimilarProducts,
    });
  } catch (error) {
    console.log('Error fetching product details:', error);
    res.redirect('/pageNotFound');
  }
};

module.exports = {
  productDetails
}