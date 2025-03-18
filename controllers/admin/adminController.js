const mongoose = require('mongoose')
const userModel = require('../../models/userSchema')
const bcrypt = require('bcrypt')


const loadLogin = (req,res)=>{
  if(req.session.admin){
    return res.redirect('/admin/dashboard')
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
        return res.redirect('/admin')
      }
      else{
        return res.redirect('/ login')
      }
    }else{
      return res.redirect('/login')
    }
    
  } catch (error) {
    
    console.log('login error',error)
    res.redirect('/pageError')
  }
}



const loadDashboard = async (req,res)=>{
  if(req.session.admin){
    try {
      res.render('dashboard')
    } catch (error) {
      res.redirect('/ pageError')
    }
  }
}


module.exports = {
  loadLogin,
  login,
  loadDashboard
}