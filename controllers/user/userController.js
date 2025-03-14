const userModel = require ('../../models/userSchema')


const loadHome = async (req,res)=>{
  try {
    return res.render('home')
  } catch (error) {
    console.log('Home page not found',error);
    res.status(500).send('Server error')

  }
}

const loadLogin = async(req,res)=>{
  try {
    res.render('login')
  } catch (error) {
    console.log('login page not found',error);
    res.redirect('/page-404')
    
  }
}

const loadSignup = async(req,res)=>{
  try {
    res.render('signup')
  } catch (error) {
    console.log('sign up page not found',error);
    res.redirect('/page-404')
    
  }
}

const signup = async (req,res)=>{
  const {name,email,password,phone} = req.body
  try {
    const newUser = new userModel({name,email,phone,password})
    await newUser.save()
    console.log(newUser);
    
    return res.redirect('/login')

  } catch (error) {
    console.log('Error for save User',error);
    res.status(500).send('Internal server error')
    
  }
}


const pageNotFound = async(req,res)=>{
  try {
     res.render('page-404')
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}

module.exports = {
  loadHome,
  pageNotFound,
  loadLogin,
  loadSignup,
  signup
}