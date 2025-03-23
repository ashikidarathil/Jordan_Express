const mongoose = require('mongoose')
const userModel = require('../../models/userSchema')
const bcrypt = require('bcrypt')


const pageError = async(req,res)=>{
  res.render('admin-error')
}

const loadLogin = (req,res)=>{
  if(req.session.admin){
    return res.redirect('/admin/')
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



const loadDashboard = async (req,res)=>{
  if(req.session.admin){
    try {
     
      return res.render('dashboard')
    } catch (error) {
      res.redirect('/pageError')
    }
  }
}

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