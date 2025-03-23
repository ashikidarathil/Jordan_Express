const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/userController')
const passport = require('passport')
const {userAuth,adminAuth} = require('../middlewares/auth')

router.get('/pageNotFound',userController.pageNotFound)
router.get('/login',userController.loadLogin)
router.post('/login',userController.login)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post('/verify-otp',userController.verifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/logout',userController.logout)


// Main pages
router.get('/',userController.loadHome)
router.get('/shop',userAuth,userController.loadShop)
router.get('/filter',userAuth,userController.filterProduct);
router.get('/filterprice',userAuth,userController.filterByPrice)
router.post('/search',userAuth,userController.searchProducts)



router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
  res.redirect('/')
})



router.get('/shop',userController.loadShop)


module.exports = router