const express = require('express')
const router = express.Router();
const adminController = require('../controllers/admin/adminController')
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const productController = require('../controllers/admin/productController')
const uploads = require('../config/multerConfig')
const {userAuth,adminAuth} = require('../middlewares/auth')


router.get('/pageError',adminController.pageError)
router.get('/login',adminController.loadLogin)
router.post('/login',adminController.login)
router.get('/',adminAuth,adminController.loadDashboard)
router.get('/logout',adminController.logout)

// Customer Managment
router.get('/users',adminAuth,customerController.customerInfo)
router.get('/blockCustomer',adminAuth,customerController.customerBlocked)
router.get('/unblockCustomer',adminAuth,customerController.customerunBlocked)

// category Managment
router.get('/category',adminAuth,categoryController.categoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory)
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer)
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer)
router.get('/listCategory',adminAuth,categoryController.getListCategory)
router.get('/unListCategory',adminAuth,categoryController.getUnListCategory)
router.get('/editCategory',adminAuth,categoryController.getEditCategory)
router.post('/editCategory/:id',adminAuth,categoryController.editCategory)
router.post('/category/soft-delete/:id', categoryController.softDeleteCategory);





// product Managment
router.get('/addProducts',adminAuth,productController.getProductAddPage)
router.post('/addProducts', adminAuth, uploads.array('images', 4), productController.addProducts);
router.get('/products',adminAuth,productController.getAllProducts)
router.get('/blockProduct',adminAuth,productController.blockProduct)
router.get('/unblockProduct',adminAuth,productController.unblockProduct)
router.get('/editProduct',adminAuth,productController.getEditProduct)



router.post('/editProduct/:id', adminAuth, uploads.array('images', 4), productController.updateProduct); // Route to handle product update
router.post('/removeImage/:id', adminAuth, productController.removeImage); // Route to handle image removal
router.get('/listProduct', adminAuth, productController.listProduct);
router.get('/unlistProduct', adminAuth, productController.unlistProduct);


module.exports = router