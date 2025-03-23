const userModel = require('../../models/userSchema')
const mongoose = require('mongoose')

const customerInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = 3; // Number of items per page
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || ''; // Get the search term from the query string

    let query = { isAdmin: false }; // Only fetch non-admin users
    if (searchQuery) {
      query.$or = [
        { name: { $regex: new RegExp('^' + searchQuery, 'i') } }, // Match names starting with search term
        { email: { $regex: new RegExp('^' + searchQuery, 'i') } } 
      ];
    }

    const userData = await userModel.find(query)
      .sort({ createdAt: -1 }) // Sort by creation date (newest first)
      .skip(skip)
      .limit(limit);

    const totalCustomers = await userModel.countDocuments(query);
    const totalPages = Math.ceil(totalCustomers / limit);



    res.render('customers', {
      data: userData,
      totalPages: totalPages,
      currentPage: page,
      search: searchQuery,
 

    });

  } catch (error) {
    console.error("Error in customerInfo:", error);
    res.redirect('/admin/pageError');
  }
};

const customerBlocked = async(req,res)=>{
  try {

    let id = req.query.id;
    await userModel.updateOne({_id:id},{$set:{isBlocked:true}})
    res.redirect('/admin/users?message=User blocked successfully');

  } catch (error) {
    res.redirect('/pageError')
  }
}

const customerunBlocked = async(req,res)=>{
  try {
    let id = req.query.id
    await userModel.updateOne({_id:id},{$set:{isBlocked:false}})
    res.redirect('/admin/users?message=User unblocked successfully');
    
  } catch (error) {

    res.redirect('/pageError')
    
  }
}


module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked
}