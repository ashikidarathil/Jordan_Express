const userModel = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')


const loadHome = async (req, res) => {
  try {
    const user = req.session.user
    if(user){
      const userData = await userModel.findOne({
        id:user._id
      })
      return res.render('home',{user:userData})
    }
    else{
      return res.render('home')
    }
    
  } catch (error) {
    console.log('Home page not found', error);
    res.status(500).send('Server error')

  }
}



const loadLogin = async (req, res) => {
  try {

    if (!req.session.user) {
      return res.render('login')
    }
    else {
      res.redirect('/')
    }
  } catch (error) {
    res.redirect('/pageNotFound')

  }
}

const loadSignup = async (req, res) => {
  try {
    res.render('signup')
  } catch (error) {
    console.log('sign up page not found', error);
    res.redirect('/page-404')

  }
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    })

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP:${otp}</b>`
    })

    return info.accepted.length > 0

  } catch (error) {
    console.error('Error Sending Email', error)
    return false
  }

}

const signup = async (req, res) => {
  try {
    const { name, email, phone, password, confirm_pass } = req.body
    if (password !== confirm_pass) {
      return res.render('signup', { message: 'Password and confirm password are not match' })
    }

    const findUser = await userModel.findOne({ email })
    if (findUser) {
      return res.render('signup', { message: 'User with this email already exists' })
    }

    const otp = generateOtp()

    const emailSend = sendVerificationEmail(email, otp)

    if (!emailSend) {
      return res.json('Email-error')
    }

    req.session.userOtp = otp;
    req.session.userData = { name, email, phone, password }

    res.render('verifyOtp')
    console.log(`Your OTP is ${otp}`)

  } catch (error) {
    console.error('Signup error', error)
    res.redirect('/pafeNotFound')
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10)
    return passwordHash;

  } catch (error) {

  }
}

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body
    console.log(otp);

    if (otp === req.session.userOtp) {
      const user = req.session.userData
      const passwordHash = await securePassword(user.password)

      const saveUserdata = new userModel({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash
      })

      await saveUserdata.save()
      req.session.user = saveUserdata._id;
      res.status(200).json({
        success: true,
        redirectUrl: '/'
      })
    }
    else {
      res.status(400).json({
        success: false,
        message: 'Invaid OTP, Please try again '
      })
    }

  } catch (error) {
    console.log('Error verifying OTP', error)
    res.status(500).json({
      success: false,
      message: 'An error occured'
    })
  }
}


const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email Not found in session'
      })
    }

    const otp = generateOtp()

    req.session.userOtp = otp

    const emailSend = await sendVerificationEmail(email, otp)

    if (emailSend) {
      console.log(`Resend OTP : ${otp}`)
      res.status(200).json({
        success: true,
        message: 'OTP resend successfully'
      })
    }
    else {
      res.status(500).json({
        success: false,
        message: "Failed to resend OTP. Please try again"
      })
    }
  } catch (error) {
    console.error('Error resending OTP', error)
    res.status(500).json({
      success: false,
      message: 'Internal Server error.Please try again'
    })

  }
}


const pageNotFound = async (req, res) => {
  try {
    res.render('page-404')
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}


const login = async (req, res) => {
  try {

    const { email, password } = req.body
    const findUser = await userModel.findOne({
      isAdmin: 0,
      email: email,
    })

    if (!findUser) {
      return res.render('login', { message: 'User Not Found' })
    }
    if (findUser.isBlocked) {
      return res.render('login',{message:'User is Blocked by Admin'})
    }

    const passwordMatch = await bcrypt.compare(password,findUser.password);

    if(!passwordMatch){
      return res.render('login',{message:'Incorrect Password '})
    }

    req.session.user = findUser._id;
    res.redirect('/')

  } catch (error) {
    console.error('login error',error)
    res.render('login',{message:'Login failed. Please try again later'})

  }
}

const logout = async (req,res)=>{
  try {
    
    req.session.destroy((err)=>{
      if(err){
        console.log('Session destruction error',err);
        return res.redirect('/pageNotFound')
      }
      return res.redirect('/login')
    })
  } catch (error) {
    
    console.log('Logout error',error)
    res.redirect('/pageNotFound')
  }
}

module.exports = {
  loadHome,
  pageNotFound,
  loadLogin,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  login,
  logout
}