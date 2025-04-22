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
    const { productName, description, brand, regularPrice, salePrice, color, category, size } = req.body;

    const productExists = await productModel.findOne({ productName });
    if (productExists) {
      return res.status(400).json({ success: false, message: 'Product already exists.' });
    }

    if (!brand || brand.trim() === '') {
      return res.status(400).json({ success: false, message: 'Brand is required' });
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join('public', 'uploads', 'product-image', `resized-${req.files[i].filename}`);
        await sharp(originalImagePath)
          .resize({ width: 440, height: 440, fit: 'cover' })
          .toFile(resizedImagePath);
        images.push(`resized-${req.files[i].filename}`);
      }
    }

    const categoryDoc = await categoryModel.findOne({ name: category });
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category name' });
    }

    let sizeArray = [];
    if (Array.isArray(size)) {
      sizeArray = size.map((s) => ({
        size: s.size,
        quantity: parseInt(s.quantity) || 0,
      }));
    }

    if (!sizeArray.length || sizeArray.every((s) => s.quantity <= 0)) {
      return res.status(400).json({ success: false, message: 'At least one size with a positive quantity is required' });
    }

    // Calculate the effective offer
    const productOffer = 0; // Default product offer if not set initially
    const categoryOffer = categoryDoc.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const finalSalePrice = Math.floor(parseFloat(regularPrice) * (1 - effectiveOffer / 100));

    const newProduct = new productModel({
      productName,
      description,
      brand,
      category: categoryDoc._id,
      regularPrice: parseFloat(regularPrice),
      salePrice: finalSalePrice,
      productOffer: productOffer,
      createdAt: new Date(),
      size: sizeArray,
      color,
      productImage: images,
      status: sizeArray.some((s) => s.quantity > 0) ? 'Available' : 'Out of Stock',
    });

    await newProduct.save();
    return res.status(200).json({ success: true, message: 'Product added successfully' });
  } catch (error) {
    console.error('Error in saving product:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
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
    const { existingImages, productName, description, brand, regularPrice, salePrice, color, category, size } = req.body;
    const productId = req.params.id;
    const product = await productModel.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let sizeArray = [];
    if (Array.isArray(size)) {
      sizeArray = size.map((s) => ({
        size: s.size,
        quantity: parseInt(s.quantity),
      }));
    }

    if (!sizeArray.length || sizeArray.every((s) => s.quantity <= 0)) {
      return res.status(400).json({ success: false, message: 'At least one size with a positive quantity is required' });
    }

    const sizeSet = new Set(sizeArray.map((s) => s.size));
    if (sizeSet.size !== sizeArray.length) {
      return res.status(400).json({ success: false, message: 'Duplicate sizes are not allowed' });
    }

    let existingImagesArray = existingImages ? JSON.parse(existingImages) : [];
    let newImages = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join('public', 'uploads', 'product-image', `resized-${req.files[i].filename}`);
        await sharp(originalImagePath)
          .resize({ width: 440, height: 440, fit: 'cover' })
          .toFile(resizedImagePath);
        newImages.push(`resized-${req.files[i].filename}`);
      }
    }

    const updatedImages = [...existingImagesArray, ...newImages];
    if (updatedImages.length === 0 || updatedImages.length > 4) {
      return res.status(400).json({ success: false, message: 'Exactly 4 images are required' });
    }

    const categoryDoc = await categoryModel.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    // Apply the largest offer
    const productOffer = product.productOffer || 0;
    const categoryOffer = categoryDoc.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const finalSalePrice = Math.floor(parseFloat(regularPrice) * (1 - effectiveOffer / 100));

    Object.assign(product, {
      productName,
      description,
      brand,
      regularPrice: parseFloat(regularPrice),
      salePrice: finalSalePrice,
      color,
      category: categoryDoc._id,
      size: sizeArray,
      productImage: updatedImages,
      status: sizeArray.some((s) => s.quantity > 0) ? 'Available' : 'Out of Stock',
    });

    await product.save();
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

// Remove image controller (unchanged, but included for completeness)
const removeImage = async (req, res) => {
  try {
    const { image } = req.body;
    const product = await productModel.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Remove the image from the product
    product.productImage = product.productImage.filter((img) => img !== image);
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


const addProductOffer = async (req, res) => {
  try {
    const { percentage, productId } = req.body;
    const product = await productModel.findById(productId).populate('category');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const categoryOffer = product.category.categoryOffer || 0;
    const newProductOffer = parseInt(percentage);

    // Apply the largest offer
    const effectiveOffer = Math.max(newProductOffer, categoryOffer);
    product.productOffer = newProductOffer;
    product.salePrice = Math.floor(product.regularPrice * (1 - effectiveOffer / 100));

    await product.save();
    res.json({ success: true, message: 'Product offer added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};



  const removeProductOffer = async (req, res) => {
    try {
      const { productId } = req.body;
      const product = await productModel.findById(productId).populate('category');

      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      // Set product offer to 0
      product.productOffer = 0;

      // Recalculate salePrice based on category offer (if any)
      const categoryOffer = product.category?.categoryOffer || 0;
      product.salePrice = Math.floor(product.regularPrice * (1 - categoryOffer / 100));

      await product.save();
      res.json({ success: true, message: 'Product offer removed successfully' });
    } catch (error) {
      console.error('Error removing product offer:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
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
  unlistProduct,
  addProductOffer,
  removeProductOffer,

}