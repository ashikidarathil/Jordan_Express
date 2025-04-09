const userModel = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')
const categoryModel = require('../../models/categorySchema')
const productModel = require('../../models/productSchema')
const brandModel = require('../../models/brandSchema')
const Brand = require('../../models/brandSchema')




const loadShop = async (req, res) => {
  try {
    const search = req.query.search || '';
    const sortBy = req.query.sort || '';
    const user = req.session.user;
    const userData = await userModel.findOne({ _id: user });
    const categories = await categoryModel.find({
      isListed: true,
    });

    const categoryId = categories.map((category) => category._id.toString());

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    // Get products
    let products = await productModel.find({
      isBlocked: false,
      isListed: true,
      category: { $in: categoryId },
      "size.quantity": { $gt: 0 },
    }).lean();

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
        // Default sort by newest
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Apply pagination after sorting
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
}


// Load Home
const loadHome = async (req, res) => {
  try {
    const categories = await categoryModel.find({ isListed: true });
    let productData = await productModel.find({
      isBlocked: false,
      isListed: true,
      category: { $in: categories.map(category => category._id) },
      "size.quantity": { $gt: 0 }
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
      const error = req.query.error || null; // Get error from query parameter
      let message = null;
      if (error === 'user-exists') {
        message = 'User already exists with this email'; // Set message for display
      }
      return res.render('login', { message }); // Pass message to login.ejs
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
        // Default sort by newest
        findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const categories = await categoryModel.find({
      isListed: true,
    });

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
        const serachEntry = {
          category: findCategory ? findCategory : null,
          searchedOn: new Date()
        };
        userData.searchHistory.push(serachEntry);
        await userData.save();
      }
    }

    req.session.filteredProducts = currentProducts;

    res.render("shop", {
      user: userData,
      products: currentProducts,
      totalPages,
      currentPages,
      category: categories || null,
      search: search,
      sort: sortBy // Pass sort parameter to maintain selected option in UI
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

    // Apply sorting
    switch (sortBy) {
      case 'price-low':
        findProduct.sort((a, b) => a.salePrice - b.salePrice);
        break;
      case 'price-high':
        findProduct.sort((a, b) => b.salePrice - a.salePrice);
        break;
      case 'a-z':
        findProduct.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case 'z-a':
        findProduct.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      default:
        // Default sort by newest
        findProduct.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    let itemsPerPage = 9;
    let currentPages = parseInt(req.query.page) || 1;
    let startIndex = (currentPages - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(findProduct.length / itemsPerPage);

    const currentProducts = findProduct.slice(startIndex, endIndex);

    req.session.filteredProducts = findProduct;

    res.render('shop', {
      user: userData,
      products: currentProducts,
      category: categories,
      totalPages,
      currentPages,
      search,
      sort: sortBy // Pass sort parameter to maintain selected option in UI
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
      isListed:true,
      "size.quantity": { $gt: 0 },
      category: { $in: categoryId },
    }).lean();


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

    // Pagination
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
      sort: sortBy // Pass sort parameter to maintain selected option in UI
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

    // Base query
    const query = {
      isBlocked: false,
      isListed: true,
      "size.quantity": { $gt: 0 },
      category: { $in: categoryId }
    };

    // Add search condition if provided
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Find products with the query
    let products = await productModel.find(query).lean();

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
        // Default sort by newest (created date)
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Pagination
    const itemsPerPage = 9;
    const currentPages = parseInt(req.query.page) || 1;
    const startIndex = (currentPages - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const totalPages = Math.ceil(products.length / itemsPerPage);
    const currentProducts = products.slice(startIndex, endIndex);

    // Store filtered/sorted products in session
    req.session.filteredProducts = products;

    res.render('shop', {
      user: userData,
      products: currentProducts,
      category: categories,
      totalPages,
      currentPages,
      search: search,
      sort: sortBy // Pass sort parameter to maintain selected option in UI
    });
  } catch (error) {
    console.error("Sort error:", error);
    res.redirect("/pageNotFound");
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
  sortProducts
}