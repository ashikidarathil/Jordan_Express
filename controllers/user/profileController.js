const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv').config();
const session = require('express-session');
const passport = require('passport');
const Address = require('../../models/addressSchema');


const securePassword = async (req, res) => {
  try {

    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;

  } catch (error) {

  }
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
      subject: 'Your OTP for password reset',
      text: `your OTP is ${otp}`,
      html: `<b><h4>Your OTP is :${otp} </h4></b>`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("Email Sent: ", info.messageId)

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
    console.log('Received email:', email);

    const findUser = await userModel.findOne({ email });


    if (findUser) {
      const otp = generateOtp();
      const emailSend = await sendVerificationEmail(email, otp);


      if (emailSend) {
        req.session.userOtp = otp;
        req.session.email = email;
        console.log('OTP stored in session:', otp);
        return res.render('forgetPass-otp');
      } else {
        return res.json({
          success: false,
          message: 'Failed to send OTP, Please try again',
        });
      }
    } else {
      return res.render('forget-password', {
        message: 'User with this email does not exist',
      });
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
      return res.status(400).json({
        success: false,
        message: 'OTP is required'
      });
    }

    if (enteredOtp === req.session.userOtp) {
      res.json({
        success: true,
        redirectURL: '/reset-password'
      });
    } else {
      res.json({
        success: false,
        message: 'OTP does not match'
      });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred, please try again'
    });
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

    console.log(`Resending OTP to email : ${email}`);
    const emailSent = await sendVerificationEmail(email, otp); // Changed from ot to otp

    if (emailSent) {
      console.log(`Resend OTP: ${otp}`);
      res.status(200).json({
        success: true,
        message: 'Resend OTP successful'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send email'
      });
    }
  } catch (error) {
    console.error('Error in resend otp', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
}


const postNewPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;

    // Validate session
    if (!email) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or invalid. Please request a new password reset.'
      });
    }

    // Validate password requirements
    if (!newPass1 || !newPass2) {
      return res.status(400).json({
        success: false,
        message: 'Both password fields are required'
      });
    }

    if (newPass1.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    if (newPass1 !== newPass2) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPass1, 10);

    // Update user's password in the database
    const updateResult = await userModel.updateOne(
      { email: email },
      { $set: { password: passwordHash } }
    );

    // Check if update was successful
    if (updateResult.modifiedCount > 0) {
      // Return JSON success response
      return res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to update password. User not found or no changes made.'
      });
    }

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  }
};


const userProfile = async (req, res) => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);
    res.render('profile', {
      user: userData
    })

  } catch (error) {

    console.error(error)
    res.redirect('/pageNotFound')

  }

}


const editProfile = async (req, res) => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);

    const isGoogleUser = !!userData.googleID;

    res.render('edit-profile', {
      user: userData,
      isGoogleUser: isGoogleUser
    })

  } catch (error) {

    console.error(error)
    res.redirect('/pageNotFound')

  }

}



const changeName = async (req, res) => {
  try {
    // Render change name page
    const userId = req.session.user;
    const userData = await userModel.findById(userId);

    // Prevent name change for Google users if needed
    if (userData.googleID) {
      return res.render('error', {
        message: 'Name cannot be changed for Google-authenticated accounts'
      });
    }

    res.render('change-name', { 
      user: userData
    });
  } catch (error) {
    console.error('Error rendering change name page:', error);
    res.redirect('/pageNotFound');
  }
}

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




const changeEmail = async (req, res) => {
  try {

    res.render('change-email')

  } catch (error) {

    res.redirect('/pageNotFound')

  }
}


const verifyEmail = async (req, res) => {
  try {

    const { email } = req.body
    const userExists = await userModel.findOne({ email: email })



    if (userExists) {
      const otp = generateOtp();
      emailSend = await sendVerificationEmail(email, otp);

      if (emailSend) {
        req.session.userOtp = otp;
        req.session.userData = req.body
        req.session.email = email;
        res.render('change-email-otp')
        console.log(`Email send:${email}`)
        console.log(`Your OTP:${otp}`);


      } else {
        res.json('email-error')
      }
    }
    else {
      res.render('change-email', {
        message: 'User with this email not exists'
      })
    }

  } catch (error) {

    res.redirect('/pageNotFound')

  }
}


const getUpdateEmail = async (req, res) => {

  try {

    res.render('new-email')

  } catch (error) {

    res.redirect('/pageNotFound')

  }

}


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
      redirectURL: '/userProfile'
    });

  } catch (error) {
    console.error('Error updating email:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating email'
    });
  }
};



const changePass = async (req, res)  => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);

    res.render('change-pass', {
      user: userData
    })

  } catch (error) {

    console.error(error)
    res.redirect('/pageNotFound')

  }

}




const getAddress = async (req, res) => {

  try {

    userId = req.session.user;
    const userData = await userModel.findById(userId);
    const userAddress = await addressModel.findOne({ userID: userId });
    res.render('get-address', {
      user: userData,
      userAddress
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

    res.render('edit-address', {
      address: addressData,
      user: user
    })

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
        {
          userID: userId,
          'address._id': { $ne: addressId }
        },
        {
          $set: { 'address.$[].isDefault': false }
        }
      );
    }

    res.json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error in edit address:', error);
    res.status(500).json({ success: false, message: 'Failed to update address' });
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
  changePass,
  changeEmail,
  verifyEmail,
  verifyEmailOtp,
  resendEmailOtp,
  updateEmail,
  getUpdateEmail,
  getAddress,
  addAddress,
  editAddress,
  postEditAddress,
  deleteAddress,
  changeName,
  updateName

}