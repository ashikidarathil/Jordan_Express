const userModel = require('../../models/userSchema')
const mongoose = require('mongoose')

const customerInfo = async (req,res) => {
  try {


    let search = '';
    if (req.query.search) {
      search = req.query.search
    }

    let page = 1;
    if (req.query.page) {
      page = req.query.page
    }

    const limit = 3
    const userData = await userModel.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } }
      ]
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec()

  

    const count = await userModel.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } }
      ]
    }).countDocuments()


    const totalPages = Math.ceil(count / limit)

    const currentRoute = req.originalUrl;

    res.render('customers', {
      data: userData,
      totalPages: totalPages,
      currentPage: page,
      search: search,
      currentRoute: currentRoute
    })




  } catch (error) {

    
    console.error("Error in customerInfo:", error)
    res.redirect('/admin/pageError')
  }
}

const customerBlocked = async(req,res)=>{
  try {

    let id = req.query.id;
    await userModel.updateOne({_id:id},{$set:{isBlocked:true}})
    res.redirect('/admin/users')

  } catch (error) {
    res.redirect('/pageError')
  }
}

const customerunBlocked = async(req,res)=>{
  try {
    let id = req.query.id
    await userModel.updateOne({_id:id},{$set:{isBlocked:false}})
    res.redirect('/admin/users')
    
  } catch (error) {

    res.redirect('/pageError')
    
  }
}


module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked
}