const { session } = require('passport')
const userModel = require('../models/userSchema')
const cartModel = require('../models/cartSchema')

const userAuth = async (req, res, next) => {
  try {
    if (req.session.user) {
      const user = await userModel.findById(req.session.user);
      if (!user) {
        req.session.user = null;
        return res.redirect('/login');
      }
      if (user.isBlocked) {
        req.session.user = null;
        return res.redirect('/login?error=user-blocked');
      }
      req.user = user; 
      next();
    } else {
      res.redirect('/login');
    }
  } catch (error) {
    console.error('Error in userAuth middleware:', error);
    res.redirect('/pageNotFound');
  }
};




const adminAuth = (req, res, next) => {
  if (req.session.admin) {
      return next(); 
  } else {
      return res.redirect('/admin/login'); 
  }
};



const getCartCount = async (req, res, next) => {
  if (req.session.user) {
    const cart = await cartModel.findOne({ userID: req.session.user });
    if (cart) {
      const totalSizeCount = cart.item.reduce((count, item) => count + item.size.length, 0);
      res.locals.cartCount = totalSizeCount;
    } else {
      res.locals.cartCount = 0;
    }
  } else {
    res.locals.cartCount = 0;
  }
  next();
};



module.exports = {
  userAuth,
  adminAuth,
  getCartCount
}