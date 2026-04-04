const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { getOtpTemplate } = require('../../helpers/otpEmail');
const dotenv = require('dotenv').config();
const session = require('express-session');
const passport = require('passport');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema')
const Wallet = require('../../models/walletSchema')

const securePassword = async (req, res) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {}
}

function generateOtp() {
  const digits = '123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 9)]
  }
  return otp;
}

const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: '587',
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    })
    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Verify Your Jordan Express Account',
      text: `Your Verification Code is: ${otp}`,
      html: getOtpTemplate(otp)
    }
    const info = await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.log("error sending email", error);
    return false
  }
}

const getForgetPassPage = async (req, res) => {
  try {
    res.render('forget-password')
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}

const forgetEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await userModel.findOne({ email });
    if (findUser) {
      const otp = generateOtp();
      const emailSend = await sendVerificationEmail(email, otp);
      if (emailSend) {
        req.session.userOtp = otp;
        req.session.email = email;
        return res.render('forgetPass-otp');
      } else {
        return res.json({ success: false, message: 'Failed to send OTP, Please try again' });
      }
    } else {
      return res.render('forget-password', { message: 'User with this email does not exist' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.redirect('/pageNotFound');
  }
};

const verifyForgetPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (!enteredOtp) {
      return res.status(400).json({ success: false, message: 'OTP is required' });
    }
    if (enteredOtp === req.session.userOtp) {
      res.json({ success: true, redirectURL: '/reset-password' });
    } else {
      res.json({ success: false, message: 'OTP does not match' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'An error occurred, please try again' });
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render('reset-password')
  } catch (error) {
    res.redirect('/pageNotFound')
  }
}

const resendOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    const email = req.session.email;
    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      res.status(200).json({ success: true, message: 'Resend OTP successful' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error in resend otp', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

const postNewPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;
    if (!email) {
      return res.status(401).json({ success: false, message: 'Session expired or invalid.' });
    }
    if (!newPass1 || !newPass2) {
      return res.status(400).json({ success: false, message: 'Both password fields are required' });
    }
    if (newPass1.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }
    if (newPass1 !== newPass2) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const user = await userModel.findOne({ email: email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found in system.' });
    }

    const isMatch = await bcrypt.compare(newPass1, user.password);
    if (isMatch) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as your old password.' });
    }

    const passwordHash = await bcrypt.hash(newPass1, 10);
    const updateResult = await userModel.updateOne(
      { email: email },
      { $set: { password: passwordHash } }
    );
    if (updateResult.modifiedCount > 0) {
      return res.json({ success: true, message: 'Password updated successfully' });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to update password.' });
    }
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
};

const userProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await userModel.findById(userId);
    const orderCount = await Order.countDocuments({ userID: userId });
    const wallet = await Wallet.findOne({ userID: userId });
    const addressData = await addressModel.findOne({ userID: userId });
    const addressCount = addressData ? addressData.address.length : 0;

    res.render('profile', {
      user: userData,
      orderCount,
      walletBalance: wallet ? wallet.balance : 0,
      addressCount,
      activePage: 'profile'
    });
  } catch (error) {
    console.error('Error in userProfile:', error);
    res.redirect('/pageNotFound');
  }
};


const editProfile = async (req, res) => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);

    const isGoogleUser = !!userData.googleID;

    res.render('edit-profile', {
      user: userData,
      isGoogleUser: isGoogleUser,
      activePage: 'edit-profile'
    })

  } catch (error) {

    console.error(error)
    res.redirect('/pageNotFound')

  }

}



// changeName method removed as it is now handled via modal in editProfile.


const updateName = async (req, res) => {
  try {
    const userId = req.session.user;
    const { newName } = req.body;

    // Validation
    if (!newName || newName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Name cannot be empty'
      });
    }

    // Check name length
    if (newName.length < 2 || newName.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 50 characters'
      });
    }

    // Update user's name
    const updatedUser = await userModel.findByIdAndUpdate(
      userId, 
      { name: newName.trim() }, 
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Respond with success
    res.json({
      success: true,
      message: 'Name updated successfully',
      redirectURL: '/userProfile'
    });
  } catch (error) {
    console.error('Error updating name:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating name'
    });
  }
}




// changeEmail method removed as it is now handled via modal.



const verifyEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const userExists = await userModel.findOne({ email: email });

    if (userExists) {
      const otp = generateOtp();
      const emailSend = await sendVerificationEmail(email, otp);

      if (emailSend) {
        req.session.userOtp = otp;
        req.session.userData = req.body;
        req.session.email = email;
        
        // Handle both AJAX and normal form submissions
        const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1) || req.get('Content-Type') === 'application/json';
        
        if (isAjax) {
          return res.json({ success: true, message: 'OTP sent to your email' });
        }
        return res.status(403).send('Direct access forbidden');
      } else {
        return res.status(500).json({ success: false, message: 'Failed to send verification email' });
      }
    } else {
      const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1) || req.get('Content-Type') === 'application/json';
      
      if (isAjax) {
        return res.status(404).json({ success: false, message: 'User with this email does not exist' });
      }
      return res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


// getUpdateEmail method removed.



const resendEmailOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    const email = req.session.email;

    console.log(`Resending OTP to email: ${email}`);
    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      console.log(`Resend OTP: ${otp}`);
      return res.status(200).json({
        success: true,
        message: 'New OTP has been sent to your email'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email'
      });
    }
  } catch (error) {
    console.error('Error in resend email OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};



const verifyEmailOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    const sessionOtp = req.session.userOtp;

    if (!enteredOtp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required'
      });
    }

    if (enteredOtp === sessionOtp) {
      // Clear the OTP from session after successful verification
      req.session.userOtp = null;

      return res.json({
        success: true,
        redirectURL: '/update-email' // You might want to create this route
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }
  } catch (error) {
    console.error('Error verifying email OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during OTP verification'
    });
  }
};


const updateEmail = async (req, res) => {
  try {
    const newEmail = req.body.newEmail;
    const userId = req.session.user;

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Check if email already exists
    const emailExists = await userModel.findOne({ email: newEmail });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }

    // Update email
    await userModel.findByIdAndUpdate(userId, { email: newEmail });

    return res.json({
      success: true,
      message: 'Email updated successfully',
      redirectURL: '/edit-profile'
    });

  } catch (error) {
    console.error('Error updating email:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating email'
    });
  }
};



// changePass method removed.


const changePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { oldPassword, newPassword } = req.body;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.googleID) {
      return res.status(400).json({ success: false, message: 'Google users cannot change password here' });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // New password should not be the same as old password
    if (oldPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password cannot be the same as the current password' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.password = passwordHash;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};




const getAddress = async (req, res) => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);
    const userAddress = await addressModel.findOne({ userID: userId });
    
    // Sort addresses to show the newest first
    if (userAddress && userAddress.address) {
      userAddress.address.reverse();
    }

    res.render('get-address', {
      user: userData,
      userAddress,
      activePage: 'address'
    })

  } catch (error) {

    console.log(error)
    res.redirect('/pageNotFound')

  }
}



const addAddress = async (req, res) => {

  try {

    const userId = req.session.user
    const userData = await userModel.findOne({ _id: userId });
    const { label, street, city, state, zipCode, country, phone } = req.body;
    const userAddress = await addressModel.findOne({ userID: userData._id })

    if (!userAddress) {
      const newAddress = new addressModel({
        userID: userData._id,
        address: [{
          label,
          street,
          city,
          state,
          zipCode,
          country,
          phone
        }]
      })
      await newAddress.save()
      console.log(newAddress)
    } else {
      userAddress.address.push({
        label,
        street,
        city,
        state,
        zipCode,
        country,
        phone
      })
      await userAddress.save()
    }

    res.redirect('/address?success=true')

  } catch (error) {

    console.log('Error adding address')
    res.redirect('/pageNotFound')

  }

}


const editAddress = async (req, res) => {
  try {

    const addressId = req.query.id;

    const user = req.session.user;
    const currAddress = await addressModel.findOne({
      'address._id': addressId,
    })

    if (!currAddress) {
      console.log('Error in CurrAddress')
      return res.redirect('/pageNotFound')
    }

    const addressData = currAddress.address.find((item) => {
      return item._id.toString() === addressId.toString()
    })

    if (!addressData) {
      console.log('Error in AddressData')
      res.redirect('/pageNotFound')
    }

    const userData = await userModel.findById(userId);
    // Redirect back to address page since we now use modals
    res.redirect('/address');

  } catch (error) {

    console.log('Error in edit Address', error)
    res.redirect('/pageNotFound')

  }
}


const postEditAddress = async (req, res) => {
  try {
    const data = req.body;
    const addressId = req.query.id; // Still using query for id
    const userId = req.session.user; // Adjust based on what req.session.user contains

    console.log('Request data:', { userId, addressId, data });

    const updateResult = await addressModel.findOneAndUpdate(
      {
        userID: userId, // Match schema field name
        'address._id': addressId
      },
      {
        $set: {
          'address.$.label': data.label,
          'address.$.street': data.street,
          'address.$.city': data.city,
          'address.$.state': data.state,
          'address.$.zipCode': data.zipCode,
          'address.$.country': data.country,
          'address.$.phone': data.phone,
          'address.$.isDefault': data.isDefault === 'on'
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updateResult) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    if (data.isDefault === 'on') {
      await addressModel.updateOne(
        { userID: userId, 'address._id': { $ne: addressId } },
        { $set: { 'address.$[].isDefault': false } }
      );
    }

    return res.status(200).json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error in edit address:', error);
    return res.status(500).json({ success: false, message: 'Failed to update address. Please try again.' });
  }
};




const deleteAddress = async (req, res) => {
  try {

    const addressId = req.query.id;
    const findAddress = await addressModel.findOne({ 'address._id': addressId })

    if (!findAddress) {
      return res.status(404).json('Address not found')
    }

    await addressModel.updateOne(
      { 'address._id': addressId, },
      { $pull:{address:{_id:addressId}}}
    )
      

    res.redirect('/address')

  } catch (error) {

    console.log('Error happening in delete Address',error)
    res.redirect('/pageNotFound')

  }
}


module.exports = {
  getForgetPassPage,
  forgetEmailValid,
  verifyForgetPassOtp,
  getResetPassPage,
  resendOtp,
  postNewPassword,
  userProfile,
  editProfile,
  verifyEmail,
  verifyEmailOtp,
  resendEmailOtp,
  updateEmail,
  getAddress,
  addAddress,
  editAddress,
  postEditAddress,
  deleteAddress,
  updateName,
  changePassword

}