const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/userController')
const passport = require('passport')
const {userAuth,adminAuth,getCartCount} = require('../middlewares/auth')
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')
const cartController = require('../controllers/user/cartController')
const orderController = require('../controllers/user/orderController')
const checkoutAddressController = require('../controllers/user/checkoutAddressController');
const wishlistController = require('../controllers/user/wishlistController')

router.get('/pageNotFound',userController.pageNotFound)
router.get('/login',userController.loadLogin)
router.post('/login',userController.login)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post('/verify-otp',userController.verifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/logout',userController.logout)

router.use(getCartCount);

// Main pages
router.get('/',userController.loadHome)
router.get('/shop',userAuth,userController.loadShop)
router.get('/filter',userAuth,userController.filterProduct);
router.get('/filterprice',userAuth,userController.filterByPrice)
router.post('/search',userAuth,userController.searchProducts)
router.get('/sort', userAuth, userController.sortProducts); 


// Product Managment
router.get('/productDetails',userAuth,productController.productDetails)



// Profile Managment
router.get('/forget-password',profileController.getForgetPassPage)
router.post('/forget-email-valid',profileController.forgetEmailValid)
router.post('/verify-forgetPass-otp',profileController.verifyForgetPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendOtp)
router.post('/reset-password',profileController.postNewPassword)
router.get('/userProfile',userAuth,profileController.userProfile)
router.get('/edit-Profile',userAuth,profileController.editProfile)
router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email',userAuth,profileController.verifyEmail)
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp)
router.post('/resend-email-otp',userAuth,profileController.resendEmailOtp)
router.get('/update-email',userAuth,profileController.getUpdateEmail)
router.post('/update-email',userAuth,profileController.updateEmail)
router.get('/change-pass',userAuth,profileController.changePass)
router.get('/change-name', userAuth,profileController.changeName);
router.post('/update-name', userAuth,profileController.updateName);


// Address Managment
router.get('/address',userAuth,profileController.getAddress)
router.post('/add-address',userAuth,profileController.addAddress)
router.get('/edit-address',userAuth,profileController.editAddress)
router.post('/edit-address', userAuth, profileController.postEditAddress);
router.get("/delete-address",userAuth,profileController.deleteAddress)


// Cart Mangamnet
router.get("/cart", userAuth,cartController.getCartPage)
router.post('/add-to-cart', userAuth, cartController.addToCart);
router.post('/update-cart-item', userAuth, cartController.updateCartItem);
router.post('/remove-size-from-cart', userAuth, cartController.removeSizeFromItem);
router.post('/remove-from-cart', userAuth, cartController.removeFromCart);


// Checkout and Order Management
router.get('/checkout', userAuth, orderController.getCheckoutPage);
router.post('/apply-coupon', orderController.applyCoupon);
router.post('/remove-coupon', userAuth, orderController.removeCoupon);
router.post('/place-order', userAuth, orderController.placeOrder);
router.get('/order-success/:orderId', userAuth, orderController.getOrderSuccessPage); 
router.get('/orders', userAuth, orderController.getOrdersPage);
router.get('/order-details/:orderId', userAuth, orderController.getOrderDetailsPage);
router.post('/cancel-order/:orderId', userAuth, orderController.cancelOrder);
router.post('/return-order/:orderId', userAuth, orderController.returnOrder);
router.get('/orders/:orderId/invoice', userAuth, orderController.downloadInvoice);
router.get('/wallet', userAuth, orderController.getWalletPage);


// Wishlist Managamnet
router.get('/wishlist', userAuth, wishlistController.getWishlistPage);
router.post('/add-to-wishlist', userAuth, wishlistController.addToWishlist);
router.post('/remove-from-wishlist', userAuth, wishlistController.removeFromWishlist);
router.post('/move-to-cart', userAuth, wishlistController.moveToCart);



// API endpoints for checkout address management
router.get('/api/checkout/addresses', userAuth, checkoutAddressController.getCheckoutAddresses);
router.post('/api/checkout/addresses', userAuth, checkoutAddressController.addCheckoutAddress);
router.put('/api/checkout/addresses/:addressId', userAuth, checkoutAddressController.editCheckoutAddress);





router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// Google Callback Route
router.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=user-exists', // Redirect to /login with error query
  }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect('/'); // Success: redirect to home
  }
);



router.use(getCartCount);



module.exports = router