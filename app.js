const express = require('express')
const app = express()
const env = require('dotenv').config()
const ConnectDB = require('./config/db')
const connectDB = require('./config/db')

connectDB()

app.listen(process.env.PORT,()=>{
  console.log('Server is running..')
})


module.exports = app