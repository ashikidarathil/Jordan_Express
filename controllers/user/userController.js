const userModel = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')
const categoryModel = require('../../models/categorySchema')
const productModel = require('../../models/productSchema')
const brandModel = require('../../models/brandSchema')
const { generateReferralCode } = require('../../services/referral');
const Wallet = require('../../models/walletSchema');
const Contact = require('../../models/contactSchema');


const calculateDiscountPercentage = (products) => {
  return products.map(product => {
    const discountPercentage = product.regularPrice > product.salePrice
      ? Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100)
      : 0;
    return { ...product, discountPercentage };
  });
};



const loadShop = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sortBy = req.query.sort || '';
    const user = req.session.user;
    const userData = await userModel.findOne({ _id: user });
    const categories = await categoryModel.find({ isListed: true });

    const categoryId = categories.map((category) => category._id.toString());

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    let products = await productModel.find({
      isBlocked: false,
      isListed: true,
      category: { $in: categoryId },
      "size.quantity": { $gt: 0 },
    }).lean();

    // Calculate discount percentage
    products = calculateDiscountPercentage(products);

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        products.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        products.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        products.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        products.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const paginatedProducts = products.slice(skip, skip + limit);
    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / limit);

    const categoriesWithId = categories.map(category => ({ _id: category._id, name: category.name }));

    res.render('shop', {
      user: userData,
      products: paginatedProducts,
      category: categoriesWithId,
    
      currentPages: page,
      totalPages: totalPages,
      search: search,
      sort: sortBy
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).render('error', { message: 'Failed to load shop page' });
  }
};


const loadHome = async (req, res) => {
  try {
    const categories = await categoryModel.find({ isListed: true });
    let productData = await productModel.find({
      isBlocked: false,
      isListed: true,
      category: { $in: categories.map(category => category._id) },
      "size.quantity": { $gt: 0 }
    }).lean();

    // Add discount percentage to each product
    productData = productData.map(product => {
      const discountPercentage = product.regularPrice > product.salePrice
        ? Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100)
        : 0;
      return { ...product, discountPercentage };
    });

    productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    productData = productData.slice(0, 4);

    const userId = req.session.user;
    res.set('Cache-Control', 'no-store');

    if (userId) {
      const userData = await userModel.findById(userId);
      if (!userData) {
        req.session.user = null;
        return res.redirect('/login');
      }
      // Check if the user is blocked
      if (userData.isBlocked) {
        req.session.user = null;
        return res.redirect('/login?error=user-blocked');
      }
      return res.render('home', { user: userData, products: productData });
    } else {
      return res.render('home', { user: null, products: productData });
    }
  } catch (error) {
    console.log('Home page not found', error);
    res.status(500).render('page-404', { message: 'Server error. Please try again later.' });
  }
};


// Load login
const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      const error = req.query.error || null;
      let message = null;
      if (error === 'user-exists') {
        message = 'User already exists with this email';
      } else if (error === 'user-blocked') {
        message = 'Your account is blocked. Please contact support.';
      }
      return res.render('login', { message });
    } else {
      res.redirect('/');
    }
  } catch (error) {
    console.error('Error in loadLogin:', error);
    res.redirect('/pageNotFound');
  }
};
const loadSignup = async (req, res) => {
  try {

    if (!req.session.user) {
      return res.render('signup')
    } else {
      res.redirect('/')
    }

  } catch (error) {
    res.redirect('/pageNotFound')

  }
}


// Generate OTP
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


// Load signup
const signup = async (req, res) => {
  try {
    const { name, email, phone, password, confirm_pass, referralCode } = req.body;
    if (password !== confirm_pass) {
      return res.render('signup', { message: 'Password and confirm password do not match' });
    }

    const findUser = await userModel.findOne({ email });
    if (findUser) {
      return res.render('signup', { message: 'User with this email already exists' });
    }

    // Validate referral code if provided
    let referringUser = null;
    if (referralCode) {
      referringUser = await userModel.findOne({ referralCode });
      if (!referringUser) {
        return res.render('signup', { message: 'Invalid referral code' });
      }
    }

    const otp = generateOtp();
    const emailSend = await sendVerificationEmail(email, otp);

    if (!emailSend) {
      return res.json('Email-error');
    }

    req.session.userOtp = otp;
    req.session.userData = { name, email, phone, password, referralCode };

    res.render('verifyOtp');
    console.log(`Your OTP is ${otp}`);
  } catch (error) {
    console.error('Signup error', error);
    res.redirect('/pageNotFound');
  }
};


// Password
const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10)
    return passwordHash;

  } catch (error) {

  }
}

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);

      
      const referralCode = await generateReferralCode();

      const saveUserdata = new userModel({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referralCode,
        redeemed: user.referralCode ? true : false,
        redeemedUser: user.referralCode ? (await userModel.findOne({ referralCode: user.referralCode }))._id : null
      });

      await saveUserdata.save();

      // Create wallet for the new user
      const newWallet = new Wallet({
        userID: saveUserdata._id,
        balance: 0,
        transactions: []
      });
      await newWallet.save();

      // Handle referral rewards
      if (user.referralCode) {
        const referringUser = await userModel.findOne({ referralCode: user.referralCode });
        if (referringUser) {
          referringUser.referredUsers.push(saveUserdata._id);
          await referringUser.save();

          // Credit 499 to new user's wallet
          const newUserWallet = await Wallet.findOne({ userID: saveUserdata._id });
          newUserWallet.balance += 499;
          newUserWallet.transactions.push({
            type: 'credit',
            amount: 499,
            description: 'Referral bonus for signing up with referral code'
          });
          await newUserWallet.save();

          // Credit 499 to referring user's wallet
          const referringWallet = await Wallet.findOne({ userID: referringUser._id });
          if (!referringWallet) {
            const newReferringWallet = new Wallet({
              userID: referringUser._id,
              balance: 499,
              transactions: [{
                type: 'credit',
                amount: 499,
                description: `Referral bonus for referring ${saveUserdata.name}`
              }]
            });
            await newReferringWallet.save();
          } else {
            referringWallet.balance += 499;
            referringWallet.transactions.push({
              type: 'credit',
              amount: 499,
              description: `Referral bonus for referring ${saveUserdata.name}`
            });
            await referringWallet.save();
          }
        }
      }

      req.session.user = saveUserdata._id;
      res.status(200).json({
        success: true,
        redirectUrl: '/'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid OTP, Please try again'
      });
    }
  } catch (error) {
    console.log('Error verifying OTP', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
};

// Resend OTP
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


// PageNotFound
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
      return res.render('login', { message: 'User is Blocked by Admin' })
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.render('login', { message: 'Incorrect Password ' })
    }

    req.session.user = findUser._id;
    res.redirect('/')

  } catch (error) {
    console.error('login error', error)
    res.render('login', { message: 'Login failed. Please try again later' })

  }
}


// Logout
const logout = async (req, res) => {
  try {

    req.session.user = null;
    req.session.destroy((err) => {
      if (err) {
        console.log('Session destruction error', err);
        return res.redirect('/pageNotFound')
      }
      return res.redirect('/login')
    })
  } catch (error) {

    console.log('Logout error', error)
    res.redirect('/pageNotFound')
  }
}


// Filter products
const filterProduct = async (req, res) => {
  try {
    const user = req.session.user;
    const category = req.query.category;
    const search = req.query.search || '';
    const sortBy = req.query.sort || '';

    const findCategory = category ? await categoryModel.findOne({ _id: category }) : null;

    const query = {
      isListed: true,
      isBlocked: false,
      "size.quantity": { $gt: 0 },
    };

    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    if (findCategory) {
      query.category = findCategory._id;
    }

    let findProducts = await productModel.find(query).lean();

    // Calculate discount percentage
    findProducts = calculateDiscountPercentage(findProducts);

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        findProducts.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        findProducts.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        findProducts.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        findProducts.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const categories = await categoryModel.find({ isListed: true });

    let itemsPerPage = 9;
    let currentPages = parseInt(req.query.page) || 1;
    let startIndex = (currentPages - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProducts.length / itemsPerPage);
    let currentProducts = findProducts.slice(startIndex, endIndex);

    let userData = null;
    if (user) {
      userData = await userModel.findOne({ _id: user });
      if (userData) {
        const searchEntry = {
          category: findCategory ? findCategory : null,
          searchedOn: new Date()
        };
        userData.searchHistory.push(searchEntry);
        await userData.save();
      }
    }

    req.session.filteredProducts = currentProducts;

    res.render("shop", {
      user: userData,
      products: currentProducts,
      noProducts: true, // Add this flag
      totalPages,
      currentPages,
      category: categories || null,
      search: search,
      sort: sortBy 
    });
  } catch (error) {
    console.error("Filter error:", error);
    res.redirect('/pageNotFound');
  }
};



// filter By price
const filterByPrice = async (req, res) => {
  try {
    const search = req.query.search || '';
    const user = req.session.user;
    const sortBy = req.query.sort || '';
    const userData = await userModel.findOne({ _id: user });

    const categories = await categoryModel.find({ isListed: true }).lean();

    const findProduct = await productModel.find({
      salePrice: { $gt: req.query.gt, $lt: req.query.lt },
      isBlocked: false,
      isListed: true,
      "size.quantity": { $gt: 0 },
    }).lean();

    // Calculate discount percentage
    let products = calculateDiscountPercentage(findProduct);

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        products.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        products.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        products.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        products.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    let itemsPerPage = 9;
    let currentPages = parseInt(req.query.page) || 1;
    let startIndex = (currentPages - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(products.length / itemsPerPage);

    const currentProducts = products.slice(startIndex, endIndex);

    req.session.filteredProducts = products;

    res.render('shop', {
      user: userData,
      products: currentProducts,
      category: categories,
      noProducts: true, // Add this flag
      totalPages,
      currentPages,
      search,
      sort: sortBy
    });
  } catch (error) {
    console.log(error);
    res.redirect('/pageNotFound');
  }
};


// Search product
const searchProducts = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await userModel.findOne({ _id: user }) : null;
    const search = req.body.query || '';
    const sortBy = req.query.sort || '';

    const categories = await categoryModel.find({ isListed: true }).lean();
    const categoryId = categories.map(category => category._id.toString());

    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let searchResult = await productModel.find({
      productName: { $regex: escapedSearch, $options: 'i' },
      isBlocked: false,
      isListed: true,
      "size.quantity": { $gt: 0 },
      category: { $in: categoryId },
    }).lean();

    // Calculate discount percentage
    searchResult = calculateDiscountPercentage(searchResult);

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        searchResult.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        searchResult.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        searchResult.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        searchResult.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        searchResult.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    let itemsPerPage = 9;
    let currentPages = parseInt(req.query.page) || 1;
    let startIndex = (currentPages - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(searchResult.length / itemsPerPage);
    const currentProducts = searchResult.slice(startIndex, endIndex);

    req.session.filteredProducts = searchResult;

    res.render('shop', {
      user: userData,
      products: currentProducts,
      category: categories,
      totalPages,
      currentPages,
      search: search,
      sort: sortBy
    });
  } catch (error) {
    console.error("Search error:", error);
    res.redirect("/pageNotFound");
  }
};



const sortProducts = async (req, res) => {
  try {
    const user = req.session.user;
    const sortBy = req.query.sort || '';
    const search = req.query.search || '';

    const userData = user ? await userModel.findOne({ _id: user }) : null;
    const categories = await categoryModel.find({ isListed: true }).lean();
    const categoryId = categories.map(category => category._id.toString());

    const query = {
      isBlocked: false,
      isListed: true,
      "size.quantity": { $gt: 0 },
      category: { $in: categoryId }
    };

    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    let products = await productModel.find(query).lean();

    // Calculate discount percentage
    products = calculateDiscountPercentage(products);

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        products.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        products.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        products.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        products.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const itemsPerPage = 9;
    const currentPages = parseInt(req.query.page) || 1;
    const startIndex = (currentPages - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const totalPages = Math.ceil(products.length / itemsPerPage);
    const currentProducts = products.slice(startIndex, endIndex);

    req.session.filteredProducts = products;

    res.render('shop', {
      user: userData,
      products: currentProducts,
      category: categories,
      noProducts: true, 
      totalPages,
      currentPages,
      search: search,
      sort: sortBy
    });
  } catch (error) {
    console.error("Sort error:", error);
    res.redirect("/pageNotFound");
  }
};


const getReferralPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await userModel.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    const referredUsers = await userModel.find({ _id: { $in: user.referredUsers } });

    res.render('referral', {
      user,
      referredUsers,
      cartCount: req.cartCount
    });
  } catch (error) {
    console.error('Error loading referral page:', error);
    res.redirect('/pageNotFound');
  }
};



const getAboutPage = (req, res) => {
  res.render('about');
};

const getContactPage = (req, res) => {
  res.render('contact');
};


const submitContactForm = async (req, res) => {
  try {
    const { fullName, email, message } = req.body;

    // Server-side validation
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email are required.' });
    }

    // Email validation
    const emailPattern = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Save to database
    const contact = new Contact({
      fullName,
      email,
      message,
    });
    await contact.save();

    res.status(200).json({ message: 'Contact form submitted successfully!' });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  loadHome,
  pageNotFound,
  loadLogin,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  login,
  logout,
  loadShop,
  filterProduct,
  filterByPrice,
  searchProducts,
  sortProducts,
  getReferralPage,
  getContactPage,
  getAboutPage,
  submitContactForm
}