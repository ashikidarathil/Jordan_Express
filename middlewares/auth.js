const { session } = require('passport')
const userModel = require('../models/userSchema')
const cartModel = require('../models/cartSchema')

const userAuth = (req, res, next) => {
  if (req.session.user) {
    userModel.findById(req.session.user)
      .then((data) => {
        if (data && !data.isBlocked) {
          req.user = data;
          next()
        }
        else {
          req.session.destroy(err => {
            if (err) console.error('Session destruction error', err);
            res.redirect('/login');
          });
        }
      })
      .catch((error) => {
        console.group('Error in user Auth middleware', error)
        res.status(500).send('Internal Server error')
      })
  } else {
    res.redirect('/login')
  }
}


const adminAuth = (req, res, next) => {
  userModel.findOne({ isAdmin: true })
    .then((data) => {
      if (data) {
        next()
      } else {
        res.redirect('admin/login')
      }
    })
    .catch((error) => {
      console.log('Error in admin Auth middleware', error)
      res.status(500).send('Internal Server error')
    })
}

const getCartCount = async (req, res, next) => {
  if (req.session.user) {
    const cart = await cartModel.findOne({ userID: req.session.user });
    res.locals.cartCount = cart ? cart.item.length : 0;
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