const categoryModel = require('../../models/categorySchema')
const productModel = require('../../models/productSchema')

const categoryInfo = async (req, res) => {
  try {

    const page = parseInt(req.query.page)
    const limit = 4
    const skip = (page - 1) * limit;

    const categoryData = await categoryModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const totalCategories = await categoryModel.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    res.render('category', {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories
    })

  } catch (error) {

    console.log(error)
    res.redirect('/admin/pageError')

  }
}


const addCategory = async (req, res) => {


  const { name, description } = req.body

  try {
    const existCategory = await categoryModel.findOne({ name })
    if (existCategory) {
      return res.status(400).json({ error: 'category already exists' })
    }

    const newCategory = new categoryModel({
      name,
      description
    })

    await newCategory.save()
    return res.json({ message: 'category added successfully' })

  } catch (error) {

    return res.status(500).json({ error: 'Internal server error' })

  }
}


const addCategoryOffer = async (req, res) => {
  try {
    const percentage = parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;

    const category = await categoryModel.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        status: false,
        message: 'Category not found',
      });
    }

    const products = await productModel.find({ category: category._id });
    const hasProductOffer = products.some((product) => {
      return product.productOffer > percentage;
    });

    if (hasProductOffer) {
      return res.json({
        status: false,
        message: 'Products within this category already have product offer',
      });
    }

    await categoryModel.updateOne(
      { _id: categoryId },
      { $set: { categoryOffer: percentage } }
    );

    for (const product of products) {
      product.productOffer = 0;
      product.salePrice = Math.floor(product.regularPrice * (1 - percentage / 100)); // Apply category offer
      await product.save();
    }

    res.json({
      status: true,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};


const removeCategoryOffer = async (req, res) => {
  try {
    const categoryId = req.body.categoryId;
    const category = await categoryModel.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        status: false,
        message: 'Category not found',
      });
    }

    const products = await productModel.find({ category: category._id });

    if (products.length > 0) {
      for (const product of products) {
        product.salePrice = product.regularPrice; // Reset to regular price
        product.productOffer = 0;
        await product.save();
      }
    }

    category.categoryOffer = 0;
    await category.save();

    res.json({
      status: true,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};



const getListCategory = async (req, res) => {

  try {

    let id = req.query.id;
    await categoryModel.updateOne({ _id: id }, { $set: { isListed: false } })
    res.redirect('/admin/category')

  } catch (error) {
    res.redirect('/pageError')
  }

}



const getUnListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await categoryModel.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect('/admin/category')

  } catch (error) {

    res.redirect('/pageError')

  }
}



const getEditCategory = async(req,res)=>{
  try {

    const id = req.query.id;
    const category = await categoryModel.findOne({_id:id})
    res.render('edit-category',{category:category })
    
  } catch (error) {

    res.redirect('/pageError')
    
  }
}


const editCategory = async(req,res)=>{
  try {

    const id = req.params.id
    const {categoryName,description} = req.body
    const existingCategory = await categoryModel.findOne({name:categoryName})

    if(existingCategory){
      return res.status(400).json({
        error:'Category exists ,Please choose another nmae'
      })
    }

    const updatecategory = await categoryModel.findByIdAndUpdate(id,{
      name:categoryName,
      description:description
    },{new:true})

    if(updatecategory){
      return res.redirect('/admin/category')
    }else{
      res.status(400).json({
        error:'Category not found'
      })
    }
    
  } catch (error) {

    res.status(500).json('Internal server error')
  }
}

module.exports = {
  categoryInfo,
  addCategory,
  addCategoryOffer,
  removeCategoryOffer,
  getListCategory,
  getUnListCategory,
  getEditCategory,
  editCategory

}