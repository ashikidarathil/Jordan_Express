const { session } = require('passport')
const userModel = require('../models/userSchema')

const userAuth = (req,res,next)=>{
  if(req.session.user){
    userModel.findById(req.session.user)
    .then((data)=>{
      if(data && !data.isBlocked){
        next()
      }
      else{
        res.redirect('/login')
      }
    })
    .catch((error)=>{
      console.group('Error in user Auth middleware',error)
      res.status(500).send('Internal Server error')
    })
  }else{
    res.redirect('/login')
  }
}


const adminAuth = (req,res,next)=>{
  userModel.findOne({isAdmin:true})
  .then((data)=>{
    if(data){
      next()
    }else{
      res.redirect('admin/login')
    }
  })
  .catch((error)=>{
    console.log('Error in admin Auth middleware',error)
    res.status(500).send('Internal Server error')
  })
}

module.exports = {
  userAuth,
  adminAuth
}