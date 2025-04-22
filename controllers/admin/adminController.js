const mongoose = require('mongoose')
const userModel = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Order = require('../../models/orderSchema')
const bcrypt = require('bcrypt')


const pageError = async(req,res)=>{
  res.render('admin-error')
}

const loadLogin = (req,res)=>{
  if(req.session.admin){
    return res.redirect('/admin/login')
  }

  res.render('admin-login',{message:null})
}


const login = async(req,res)=>{
  try {

    const {email,password} = req.body
    const admin = await userModel.findOne({
      email,isAdmin:true
    })

    if(admin){
      passwordMatch = bcrypt.compare(password,admin.password)
      if(passwordMatch){
        req.session.admin = true;
        return res.redirect('/admin/adminDashboard')
      }
      else{
        return res.redirect('/login')
      }
    }else{
      return res.redirect('/login')
    }
    
  } catch (error) {
    
    console.log('login error',error)
    res.redirect('/pageError')
  }
}



const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {

      const totalUsers = await userModel.countDocuments();
      const totalProducts = await Product.countDocuments();
      const totalOrders = await Order.countDocuments();
      const totalRevenue = await Order.aggregate([
        { $group: { _id: null, total: { $sum: "$finalAmount" } } }
      ]).then(result => result[0]?.total || 0);

      const totalDeliveryCharge = await Order.aggregate([
        { $group: { _id: null, total: { $sum: "$deliveryCharge" } } }
      ]).then(result => result[0]?.total || 0);


      const recentOrders = await Order.find()
        .populate('userID', 'name')
        .populate('orderItems.product')
        .sort({ createdOn: -1 })
        .limit(5);


      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const dateFilter = {
        createdOn: {
          $gte: yearStart,
          $lte: new Date(),
        },
      };

      const allOrders = await Order.find(dateFilter);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTotals = Array(12).fill(0);

      allOrders.forEach(order => {
        const month = order.createdOn.getMonth();
        monthlyTotals[month] += order.finalAmount;
      });

      const salesData = {
        chartLabels: months,
        monthlyData: monthlyTotals,
      };


      const bestSellingProducts = await Order.aggregate([
        { $unwind: '$orderItems' },
        {
          $group: {
            _id: '$orderItems.product',
            totalSold: { $sum: '$orderItems.quantity' },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $project: {
            productName: '$product.productName',
            productImage: { $arrayElemAt: ['$product.productImage', 0] }, // Get the first image
            totalSold: 1,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]);

 
      const bestSellingCategories = await Order.aggregate([
        { $unwind: '$orderItems' },
        {
          $lookup: {
            from: 'products',
            localField: 'orderItems.product',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: '$product.category',
            totalSold: { $sum: '$orderItems.quantity' },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: '$category' },
        {
          $project: {
            categoryName: '$category.name',
            totalSold: 1,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
      ]);

      res.render('admin-dashboard', {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        totalDeliveryCharge,
        recentOrders,
        salesData,
        bestSellingProducts,
        bestSellingCategories,
      });
    } catch (error) {
      console.log('Dashboard error:', error);
      res.redirect('/admin/pageError');
    }
  }
};



  const logout = async(req,res)=>{

    try {

      req.session.destroy((err)=>{
        if(err){
          console.log('Error destroying session',err)
        }

        res.redirect('/admin/login')
      })
      
    } catch (error) {

      console.log('Unexpected error during logout',error)
      res.redirect('/pageError')
      
    }

  }


module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageError,
  logout
}