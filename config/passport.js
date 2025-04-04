const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const userModel = require('../models/userSchema');
const dotenv = require('dotenv').config();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Validate environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Google Client ID or Client Secret is missing in .env file');
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/google/callback`,
      proxy: true, 
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Profile received:', profile.id, profile.displayName);

        
        let user = await userModel.findOne({ googleID: profile.id });
        if (user) {
          return done(null, user);
        }

        

        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        if (!email) {
          return done(new Error('No email provided by Google'), null);
        }

        // Check for existing user by email
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
          console.log('User already exists with email:', email);
          return done(null, false, { message: 'User already exists with this email' });
        }

        // Create new user
        console.log('Creating new user with email:', email);
        user = new userModel({
          name: profile.displayName,
          email: email,
          googleID: profile.id,
        });
        await user.save();
        return done(null, user);
      } catch (error) {
        console.error('Error in Google Strategy:', error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userModel.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;