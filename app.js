const express = require('express')
const app = express()
const env = require('dotenv').config()
const path = require('path')
const session = require('express-session')
const connectDB = require('./config/db')
const userRouter = require('./routes/userRouter')
const adminRouter = require('./routes/adminRouter')
const passport = require('./config/passport')
const flash = require('connect-flash');

connectDB()


app.set('view cache', false);
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
  secret:process.env.SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
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


app.use((req, res, next) => {
  res.locals.user = req.user || null; 
  next();
});

app.use('/',userRouter)
app.use('/admin',adminRouter)

app.use((err, req, res, next) => {
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    message: err.message || "An internal server error occurred",
    success: false,
  });
});

app.listen(process.env.PORT,()=>{
  console.log('Server is running..')
})


module.exports = app