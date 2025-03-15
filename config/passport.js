const passport = require('passport')
const googleStrategy = require('passport-google-oauth20').Strategy;
const userModel = require('../models/userSchema');
const dotenv = require('dotenv').config()
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

passport.use(new googleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${BASE_URL}/auth/google/callback`,
  proxy: true
},

  async (accessToken, refreshToken, profile, done) => {
    try {

      console.log("Profile received:", profile.id, profile.displayName);



      let user = await userModel.findOne({ googleID: profile.id })
      if (user) {
        return done(null, user)
      } else {

        const email = profile.emails && profile.emails.length > 0
          ? profile.emails[0].value
          : null;

        console.log("Creating new user with email:", email);

        user = new userModel({
          name: profile.displayName,
          email: email,
          googleID: profile.id,
        })
        await user.save()
        return done(null, user)
      }

    } catch (error) {

      return done(error, null)
    }

  }

))

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser((id, done) => {
  userModel.findById(id)
    .then(user => {
      done(null, user)
    })
    .catch(err => {
      done(err, null)
    })
})

module.exports = passport