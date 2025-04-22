const Coupon = require('../../models/couponSchema');


const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const sort = req.query.sort || '-createdOn';

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const totalCoupons = await Coupon.countDocuments(query);
    const coupons = await Coupon.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);


    const currentDate = new Date();
    const couponsWithStatus = coupons.map(coupon => {
      const isActive = coupon.isList && coupon.expireOn > currentDate;
      return {
        ...coupon._doc,
        status: isActive ? 'Active' : 'Inactive'
      };
    });

    res.render('admin-coupons', {
      coupons: couponsWithStatus,
      currentPage: page,
      totalPages: Math.ceil(totalCoupons / limit),
      totalCoupons,
      search,
      sort,
      limit
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};


const addCoupon = async (req, res) => {
  try {
    const { name, expireOn, offerPrice, minimumPrice } = req.body;

    const offerPriceNum = parseFloat(offerPrice);
    const minimumPriceNum = parseFloat(minimumPrice);
    const expireOnDate = new Date(expireOn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);


    const couponRegex = /^[A-Z]{4}\d{3}$/;
    if (!couponRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: 'Coupon must be 7 characters: 4 uppercase letters followed by 3 numbers (e.g., SAVE123)'
      });
    }

    const existingCoupon = await Coupon.findOne({ name });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    if (expireOnDate < today) {
      return res.status(400).json({ success: false, message: 'Expiration date cannot be before today' });
    }

    if (offerPriceNum >= minimumPriceNum) {
      return res.status(400).json({
        success: false,
        message: 'Offer price must be less than the minimum purchase amount'
      });
    }

    const coupon = new Coupon({
      name,
      expireOn: expireOnDate,
      offerPrice: offerPriceNum,
      minimumPrice: minimumPriceNum,
      isList: true
    });

    await coupon.save();
    res.json({ success: true, message: 'Coupon added successfully' });
  } catch (error) {
    console.error('Error adding coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to add coupon' });
  }
};



const editCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, expireOn, offerPrice, minimumPrice } = req.body;

    const offerPriceNum = parseFloat(offerPrice);
    const minimumPriceNum = parseFloat(minimumPrice);
    const expireOnDate = new Date(expireOn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    // New validation for coupon name
    const couponRegex = /^[A-Z]{4}\d{3}$/;
    if (!couponRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: 'Coupon must be 7 characters: 4 uppercase letters followed by 3 numbers (e.g., SAVE123)'
      });
    }

    const existingCoupon = await Coupon.findOne({ name, _id: { $ne: id } });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    if (expireOnDate < today) {
      return res.status(400).json({ success: false, message: 'Expiration date cannot be before today' });
    }

    if (offerPriceNum >= minimumPriceNum) {
      return res.status(400).json({
        success: false,
        message: 'Offer price must be less than the minimum purchase amount'
      });
    }

    coupon.name = name;
    coupon.expireOn = expireOnDate;
    coupon.offerPrice = offerPriceNum;
    coupon.minimumPrice = minimumPriceNum;

    await coupon.save();
    res.json({ success: true, message: 'Coupon updated successfully' });
  } catch (error) {
    console.error('Error editing coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
};




const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Coupon.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.json({ success: true, message: 'Coupon permanently deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isList = !coupon.isList;
    await coupon.save();
    res.json({ success: true, message: `Coupon ${coupon.isList ? 'listed' : 'unlisted'} successfully` });
  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getCoupons,
  addCoupon,
  editCoupon,
  deleteCoupon,
  toggleCouponStatus
};