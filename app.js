const express = require('express')
const app = express()
const env = require('dotenv').config()
const path = require('path')
const session = require('express-session')
const connectDB = require('./config/db')
const userRouter = require('./routes/userRouter')
const adminRouter = require('./routes/adminRouter')
const passport = require('./config/passport')

connectDB()

app.set('view cache', false);
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:true,
  cookie:{
    secure:false,
    httpOnly:true,
    maxAge:72*60*60*1000
  }
}))

app.use(passport.initialize())
app.use(passport.session())

app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin'),path.join(__dirname,'views/partials')])
app.use(express.static(path.join(__dirname,'public')))


app.use('/',userRouter)
app.use('/admin',adminRouter)

app.listen(process.env.PORT,()=>{
  console.log('Server is running..')
})


module.exports = app