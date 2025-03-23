const productModel = require('../../models/productSchema')
const categoryModel = require('../../models/categorySchema')
const userModel = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')


const getProductAddPage = async (req, res) => {
  try {

    const category = await categoryModel.find({ isListed: true })
    res.render('product-add', {
      cat: category
    })

  } catch (error) {

    res.redirect('/pageError')

  }
}


const addProducts = async (req, res) => {
  try {
    const { productName, description, brand, regularPrice, salePrice, quantity, color, category, size } = req.body;

    // Check if product already exists
    const productExists = await productModel.findOne({ productName });
    if (productExists) {
      return res.status(400).json({ message: 'Product already exists. Please try with another name.' });
    }

    // Validate that brand is not empty
    if (!brand || brand.trim() === '') {
      return res.status(400).json({ message: 'Brand is required' });
    }

    // Handle image uploads and resizing
    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join('public', 'uploads', 'product-image', `resized-${req.files[i].filename}`);

        // Resize image using sharp
        await sharp(originalImagePath)
          .resize({ width: 440, height: 440, fit: 'cover' })
          .toFile(resizedImagePath);

        images.push(`resized-${req.files[i].filename}`);
      }
    }

    // Find category ID
    const categoryDoc = await categoryModel.findOne({ name: category });
    if (!categoryDoc) {
      return res.status(400).json({ message: 'Invalid category name' });
    }



    // Create new product
    const newProduct = new productModel({
      productName,
      description,
      brand,
      category: categoryDoc._id,
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      createdAt: new Date(),
      size: [{
        size: size,
        quantity: parseInt(quantity) // Ensure quantity is a number
      }],
      color,
      productImage: images,
      status: 'Available'
    });

    console.log(newProduct)

    await newProduct.save();
    return res.status(200).json({
      success: true,
      message: 'Product added successfully'
    });

  } catch (error) {
    console.error('Error in saving product:', error);
    // Add more detailed error handling to show validation errors
    if (error.name === 'ValidationError') {
      // Extract validation error messages
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation failed',
        errors: errorMessages
      });
    }
    return res.redirect('/admin/pageError');
  }
};


const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;

    const searchRegex = new RegExp('^' + search, 'i');

    const products = await productModel.find({
      $or: [
        { productName: { $regex: searchRegex } },
        // { brand: { $regex: searchRegex } }
      ],
    }).sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).populate('category').exec();

    const count = await productModel.find({
      $or: [
        { productName: { $regex: searchRegex } },
        // { brand: { $regex: searchRegex } }
      ],
    }).countDocuments();

    const category = await categoryModel.find({ isListed: true });

    if (category) {
      res.render('products', {
        products: products, // Changed from data:productData to match template
        search: search, // Added search variable needed by template
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category // This doesn't appear to be used in the current template view
      });
    } else {
      res.render('page-404');
    }
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.redirect('/pageError');
  }
};



const blockProduct = async (req, res) => {
  try {

    let id = req.query.id;
    await productModel.updateOne({ _id: id }, { $set: { isBlocked: true } })

    res.status(200).json({ success: true, message: 'Product blocked successfully' });

  } catch (error) {

    res.status(500).json({ success: false, message: 'Error blocking product' });

  }
}

const unblockProduct = async (req, res) => {
  try {

    let id = req.query.id;
    await productModel.updateOne({ _id: id }, { $set: { isBlocked: false } })

    res.status(200).json({ success: true, message: 'Product blocked successfully' });

  } catch (error) {

    res.status(500).json({ success: false, message: 'Error blocking product' });

  }
}


const getEditProduct = async (req, res) => {

  try {

    const id = req.query.id;
    const product = await productModel.findOne({ _id: id })
    const category = await categoryModel.find({});
    // const brand = await brandModel.findOne({})

    let totalQuantity = 0;
    if (product.size && product.size.length > 0) {
      totalQuantity = product.size.reduce((sum, sizeObj) => sum + (sizeObj.quantity || 0), 0);
    }

    // Add totalQuantity to the product object
    product.totalQuantity = totalQuantity;

    res.render('edit-product', {
      product: product,
      category: category,
      // brand:brand
    })

  } catch (error) {

    res.redirect('/pageError')

  }

}

const updateProduct = async (req, res) => {
  try {
    const { existingImages, ...productData } = req.body;
    const product = await productModel.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Update product data
    Object.assign(product, productData);

    // Parse existingImages properly
    let existingImagesArray = [];
    if (existingImages && typeof existingImages === 'string') {
      try {
        // If it's a JSON string
        existingImagesArray = JSON.parse(existingImages);
      } catch (e) {
        // If it's a comma-separated string
        existingImagesArray = existingImages.split(',').filter(img => img.trim());
      }
    }

    // Handle new images - depends on how multer is configured
    let newImages = [];
    
    // If using uploads.array('images')
    if (req.files && Array.isArray(req.files)) {
      newImages = req.files.map(file => file.filename);
    } 
    // If using uploads.fields([{name: 'images'}, {name: 'croppedImages'}])
    else if (req.files && typeof req.files === 'object') {
      // Combine both types of images
      if (req.files.images) {
        newImages = [...newImages, ...req.files.images.map(file => file.filename)];
      }
      if (req.files.croppedImages) {
        newImages = [...newImages, ...req.files.croppedImages.map(file => file.filename)];
      }
    }
    // If using uploads.single('images')
    else if (req.file) {
      newImages = [req.file.filename];
    }

    // Combine existing and new images
    product.productImage = [...existingImagesArray, ...newImages];

    await product.save();
  
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

const removeImage = async (req, res) => {
  try {
    const { image } = req.body;
    const product = await productModel.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Remove the image from the product
    product.productImage = product.productImage.filter(img => img !== image);
    await product.save();

    // Delete the image file from the server
    const imagePath = path.join(__dirname, '../public/uploads/product-image', image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    res.json({ success: true, message: 'Image removed successfully' });
  } catch (error) {
    console.error('Error removing image:', error);
    res.status(500).json({ success: false, message: 'Failed to remove image' });
  }
};


// Updated list product 
const listProduct = async (req, res) => {
  try {
    const id = req.query.id;
    
    if (!id) {
      // Return JSON for AJAX requests, redirect with flash for direct URL access
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    
    const updatedProduct = await productModel.findByIdAndUpdate(
      id,
      { isListed: true },
      { new: true }
    );

    console.log(updatedProduct)
    
    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(200).json({ success: true, message: 'Product listed successfully' });
    } else {

      return res.redirect('/admin/products');
    }
  } catch (error) {
    console.error('Error listing product:', error);
    
    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: 'Failed to list product' });
    } else {

      return res.redirect('/admin/products');
    }
  }
};

// Updated unlist 
const unlistProduct = async (req, res) => {
  try {
    const id = req.query.id;
    
    if (!id) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    
    const updatedProduct = await productModel.findByIdAndUpdate(
      id,
      { isListed: false },
      { new: true }
    );
    
    console.log(updatedProduct)

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(200).json({ success: true, message: 'Product unlisted successfully' });
    } else {
 
      return res.redirect('/admin/products');
    }
  } catch (error) {
    console.error('Error unlisting product:', error);
    
    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: 'Failed to unlist product' });
    } else {
  
      return res.redirect('/admin/products');
    }
  }
};




module.exports = {
  getProductAddPage,
  addProducts,
  getAllProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  updateProduct,
  removeImage,
  listProduct,
  unlistProduct
}