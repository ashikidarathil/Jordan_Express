const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema')

const getWishlistPage = async (req, res) => {
  try {
      const userId = req.session.user;
      const user = await User.findById(userId);

      const wishlist = await Wishlist.findOne({ userID: userId })
          .populate('products.productId');

      let wishlistCount = 0;
      if (wishlist) {
          wishlistCount = wishlist.products.length;
      }

      if (!wishlist || wishlist.products.length === 0) {
          return res.render('wishlist', {
              user: user,
              wishlistItems: [],
              wishlistCount: wishlistCount
          });
      }

      res.render('wishlist', {
          user: user,
          wishlistItems: wishlist.products,
          wishlistCount: wishlistCount
      });

  } catch (error) {
      console.error('Error loading wishlist page:', error);
      res.redirect('/pageNotFound');
  }
};

const addToWishlist = async (req, res) => {
  try {
      const { productId } = req.body;
      const userId = req.session.user;

      const product = await Product.findById(productId);
      if (!product || product.isBlocked || !product.isListed) {
          return res.status(400).json({
              success: false,
              message: 'Product is not available'
          });
      }

      let wishlist = await Wishlist.findOne({ userID: userId });

      if (!wishlist) {
          wishlist = new Wishlist({ userID: userId, products: [] });
      }

      const existingProduct = wishlist.products.find(
          item => item.productId.toString() === productId
      );

      if (existingProduct) {
          return res.status(400).json({
              success: false,
              message: 'Product already in wishlist'
          });
      }

      wishlist.products.push({ productId: productId });
      await wishlist.save();

      res.status(200).json({
          success: true,
          message: 'Product added to wishlist',
          wishlistCount: wishlist.products.length
      });

  } catch (error) {
      console.error('Error adding to wishlist:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to add to wishlist'
      });
  }
};

// Remove from Wishlist
const removeFromWishlist = async (req, res) => {
  try {
      const { productId } = req.body;
      const userId = req.session.user;

      const wishlist = await Wishlist.findOne({ userID: userId });
      if (!wishlist) {
          return res.status(404).json({
              success: false,
              message: 'Wishlist not found'
          });
      }

      wishlist.products = wishlist.products.filter(
          item => item.productId.toString() !== productId
      );

      await wishlist.save();

      res.status(200).json({
          success: true,
          message: 'Product removed from wishlist',
          wishlistCount: wishlist.products.length
      });

  } catch (error) {
      console.error('Error removing from wishlist:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to remove from wishlist'
      });
  }
};

// Move from Wishlist to Cart
const moveToCart = async (req, res) => {
  try {
      const { productId, size } = req.body;
      const userId = req.session.user;

      const product = await Product.findById(productId);
      if (!product || product.isBlocked || !product.isListed) {
          return res.status(400).json({
              success: false,
              message: 'Product is not available'
          });
      }

      const productSize = product.size.find(s => s.size === size);
      if (!productSize || productSize.quantity < 1 || product.status === 'Out of Stock') {
          return res.status(400).json({
              success: false,
              message: 'Insufficient stock or product is out of stock'
          });
      }

      let cart = await Cart.findOne({ userID: userId });
      if (!cart) {
          cart = new Cart({ userID: userId, item: [] });
      }

      const existingItemIndex = cart.item.findIndex(
          item => item.productID.toString() === productId
      );

      if (existingItemIndex !== -1) {
          const existingSizeIndex = cart.item[existingItemIndex].size.findIndex(
              s => s.size === size
          );

          if (existingSizeIndex !== -1) {
              const newQuantity = cart.item[existingItemIndex].size[existingSizeIndex].quantity + 1;
              if (newQuantity > 5) {
                  return res.status(400).json({
                      success: false,
                      message: 'Maximum quantity limit is 5 per size'
                  });
              }
              cart.item[existingItemIndex].size[existingSizeIndex].quantity = newQuantity;
              let itemTotalQuantity = 0;
              cart.item[existingItemIndex].size.forEach(s => {
                  itemTotalQuantity += s.quantity;
              });
              cart.item[existingItemIndex].totalPrice = itemTotalQuantity * product.salePrice;
          } else {
              cart.item[existingItemIndex].size.push({ size: size, quantity: 1 });
              let itemTotalQuantity = 0;
              cart.item[existingItemIndex].size.forEach(s => {
                  itemTotalQuantity += s.quantity;
              });
              cart.item[existingItemIndex].totalPrice = itemTotalQuantity * product.salePrice;
          }
      } else {
          cart.item.push({
              productID: productId,
              size: [{ size: size, quantity: 1 }],
              price: product.salePrice,
              totalPrice: product.salePrice
          });
      }

      await cart.save();

      // Remove from wishlist
      const wishlist = await Wishlist.findOne({ userID: userId });
      if (wishlist) {
          wishlist.products = wishlist.products.filter(
              item => item.productId.toString() !== productId
          );
          await wishlist.save();
      }

      res.status(200).json({
          success: true,
          message: 'Moved to cart successfully',
          cartCount: cart.item.length,
          wishlistCount: wishlist ? wishlist.products.length : 0
      });

  } catch (error) {
      console.error('Error moving to cart:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to move to cart'
      });
  }
};


module.exports ={
  getWishlistPage,
  addToWishlist,
  removeFromWishlist,
  moveToCart
}