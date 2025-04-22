
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { generateInvoice } = require('../../services/invoiceService');


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


const DELIVERY_CHARGE = 249;
const COD_MINIMUM = 5000;

const updateStock = async (orderItems) => {
  try {
    for (const item of orderItems) {
      // Skip items with 'Cancelled' status
      if (item.status === 'Cancelled') {
        continue;
      }
      const product = await Product.findById(item.product);
      if (product) {
        const sizeVariant = product.size.find(s => s.size === item.size);
        if (sizeVariant) {
          sizeVariant.quantity -= item.quantity;
          if (sizeVariant.quantity < 0) sizeVariant.quantity = 0;

          const totalQuantity = product.size.reduce((sum, size) => sum + size.quantity, 0);
          if (totalQuantity === 0) {
            product.status = 'Out of Stock';
          }

          await product.save();
        }
      }
    }
  } catch (error) {
    console.error('Error updating stock:', error);
    throw error;
  }
};


const placeOrder = async (req, res) => {
  try {
    const { addressIndex, paymentMethod, couponCode } = req.body;
    const userId = req.session.user;

    const cart = await Cart.findOne({ userID: userId }).populate('item.productID');
    const addresses = await Address.findOne({ userID: userId });

    if (!cart || cart.item.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!addresses || !addresses.address[addressIndex]) {
      return res.status(400).json({ success: false, message: 'Invalid address selected' });
    }

    const selectedAddress = addresses.address[addressIndex];
    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });

    const deliveryCharge = subtotal < 5000 ? DELIVERY_CHARGE : 0;
    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        name: couponCode,
        isList: true,
        expireOn: { $gt: new Date() },
      });
      if (coupon && subtotal >= coupon.minimumPrice) {
        discount = coupon.offerPrice;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid or inapplicable coupon' });
      }
    }

    

    const totalPrice = subtotal + deliveryCharge;
    const finalAmount = totalPrice - discount;

    if (paymentMethod === 'COD' && finalAmount <= COD_MINIMUM) {
      return res.status(400).json({ success: false, message: 'COD is only available for orders above ₹5000' });
    }

    let wallet;
    if (paymentMethod === 'Wallet') {
      wallet = await Wallet.findOne({ userID: userId });
      const walletBalance = wallet ? wallet.balance : 0;

      if (walletBalance < finalAmount) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
    }

    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = new Order({
      userID: userId,
      orderItems: cart.item.flatMap(item =>
        item.size.map(sizeItem => ({
          product: item.productID._id,
          quantity: sizeItem.quantity,
          size: sizeItem.size,
          price: item.price,
          status: 'Pending',
        }))
      ),
      totalPrice: subtotal,
      deliveryCharge,
      discount,
      finalAmount,
      address: {
        label: selectedAddress.label,
        street: selectedAddress.street,
        city: selectedAddress.city,
        state: selectedAddress.state,
        zipCode: selectedAddress.zipCode,
        country: selectedAddress.country,
        phone: selectedAddress.phone,
      },
      paymentMethod,
      invoiceNumber,
      couponApplied: !!couponCode,
      couponCode: couponCode || null,
      walletAmount: paymentMethod === 'Wallet' ? finalAmount : 0,
      paymentStatus: paymentMethod === 'COD' ? 'Pending' : paymentMethod === 'Wallet' ? 'Paid' : 'Pending',
    });

    await order.save();

    if (paymentMethod === 'Wallet') {
  
      wallet.balance -= finalAmount;
      wallet.transactions.push({
        type: 'debit',
        amount: finalAmount,
        description: 'Order payment',
        orderID: order.orderID,
      });
      await wallet.save();
    }


    if (paymentMethod === 'Wallet' || paymentMethod === 'COD' ) {
      await updateStock(order.orderItems);
    }


    await Cart.deleteOne({ userID: userId });

    res.status(200).json({ success: true, orderId: order.orderID });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  }
};


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userID: userId }).populate({
      path: 'item.productID',
      select: 'productName productImage regularPrice size status isBlocked isListed'
    });
    const addresses = await Address.findOne({ userID: userId });
    const user = await User.findById(userId);
    const coupons = await Coupon.find({ isList: true, expireOn: { $gt: new Date() } });
    const wallet = await Wallet.findOne({ userID: userId });

    if (!cart || cart.item.length === 0) {
      return res.redirect('/cart');
    }

    const hasInvalidItems = cart.item.some(item =>
      item.productID.status === 'Out of Stock' ||
      item.productID.isBlocked ||
      !item.productID.isListed
    );

    if (hasInvalidItems) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });

    const deliveryCharge = subtotal < 5000 ? DELIVERY_CHARGE : 0;
    const discount = 0;
    const total = subtotal + deliveryCharge - discount;

    const applicableCoupons = coupons.filter(coupon => subtotal >= coupon.minimumPrice);

    res.render('checkout', {
      addresses: addresses || { address: [] },
      cartItems: cart.item,
      subtotal,
      deliveryCharge, // Pass delivery charge
      discount,
      total,
      cartCount: req.cartCount,
      user,
      coupons: applicableCoupons,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      walletBalance: wallet ? wallet.balance : 0,
      codMinimum: COD_MINIMUM // Pass COD minimum for frontend logic
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/pageNotFound');
  }
};



const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;
    const cart = await Cart.findOne({ userID: userId }).populate('item.productID');

    if (!cart || cart.item.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });

    const coupon = await Coupon.findOne({
      name: couponCode,
      isList: true,
      expireOn: { $gt: new Date() }
    });

    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
    }

    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minimumPrice} required`
      });
    }

    const discount = coupon.offerPrice;
    const deliveryCharge = subtotal < 5000 ? DELIVERY_CHARGE : 0;
    const total = subtotal + deliveryCharge - discount;

    res.status(200).json({
      success: true,
      discount,
      total,
      deliveryCharge,
      couponCode: coupon.name
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to apply coupon' });
  }
};



const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userID: userId }).populate('item.productID');

    if (!cart || cart.item.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });

    const discount = 0;
    const deliveryCharge = subtotal < 5000 ? DELIVERY_CHARGE : 0;
    const total = subtotal + deliveryCharge;

    res.status(200).json({
      success: true,
      discount,
      total,
      deliveryCharge
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to remove coupon' });
  }
};




const getOrderSuccessPage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderID: orderId })
      .populate('userID', 'email')
      .populate('orderItems.product');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('order-success', {
      orderId: order.orderID,
      orderDate: order.createdOn.toLocaleDateString(),
      orderTotal: order.finalAmount,
      deliveryCharge: order.deliveryCharge, // Added delivery charge
      paymentMethod: order.paymentMethod,
      customerEmail: order.userID.email,
      items: order.orderItems,
      address: order.address,
      cartCount: req.cartCount || 0,
      discount: order.discount
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).send('Server Error');
  }
};



const getOrdersPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const searchQuery = req.query.search ? req.query.search.trim() : '';

    let query = { userID: userId };

    if (searchQuery) {

      query.$or = [
        { orderID: { $regex: searchQuery, $options: 'i' } },
        {
          'orderItems.product': {
            $in: await Product.find({
              productName: { $regex: searchQuery, $options: 'i' }
            }).distinct('_id')
          }
        }
      ];
    }

    const orders = await Order.find(query)
      .populate('orderItems.product')
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('orders', {
      orders,
      cartCount: req.cartCount,
      currentPage: page,
      totalPages,
      searchQuery
    });
  } catch (error) {
    console.error('Error loading orders:', error);
    res.redirect('/pageNotFound');
  }
};



const getOrderDetailsPage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');

    if (!order) {
      return res.redirect('/pageNotFound');
    }
    res.render('order-details', { orders: order });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.redirect('/pageNotFound');
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const productId = req.query.productId;
    const userId = req.session.user;

    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let refundAmount = 0;
    let itemsToCancel = [];
    let includeDeliveryCharge = false;

    const itemCount = order.orderItems.length;
    const perItemDiscount = order.discount > 0 && itemCount > 0 ? order.discount / itemCount : 0;
    const activeItems = order.orderItems.filter(item => item.status !== 'Cancelled').length;

   
    const skipStockRestoration = order.paymentMethod === 'Razorpay' && order.paymentStatus === 'Failed';

    if (productId) {
      const item = order.orderItems.find(i => i.product._id.toString() === productId);
      if (!item || item.status === 'Cancelled') {
        return res.status(400).json({ success: false, message: 'Item not found or already cancelled' });
      }
      if (!['Pending', 'Processing'].includes(item.status)) {
        return res.status(400).json({ success: false, message: 'Cannot cancel item at this stage' });
      }

      item.status = 'Cancelled';
      item.cancellationReason = reason || 'No reason provided';

      if (order.paymentStatus === 'Paid') {
        refundAmount = (item.price * item.quantity) - perItemDiscount;
        if (activeItems === 2 || activeItems === 1) {
          includeDeliveryCharge = true;
          refundAmount += order.deliveryCharge;
        }
      }

      itemsToCancel.push(item);

      
      if (!skipStockRestoration) {
        const product = await Product.findById(productId);
        const sizeVariant = product.size.find(s => s.size === item.size);
        if (sizeVariant) {
          sizeVariant.quantity += item.quantity;
          await product.save();
        }
      }
    } else {
      // Cancel entire order
      for (const item of order.orderItems) {
        if (['Pending', 'Processing'].includes(item.status)) {
          item.status = 'Cancelled';
          item.cancellationReason = reason || 'No reason provided';

          if (order.paymentStatus === 'Paid') {
            refundAmount += (item.price * item.quantity) - perItemDiscount;
            includeDeliveryCharge = true;
          }

          itemsToCancel.push(item);

        
          if (!skipStockRestoration) {
            const product = await Product.findById(item.product);
            const sizeVariant = product.size.find(s => s.size === item.size);
            if (sizeVariant) {
              sizeVariant.quantity += item.quantity;
              await product.save();
            }
          }
        }
      }
      if (includeDeliveryCharge) {
        refundAmount += order.deliveryCharge;
      }
    }

    await order.save();

    // Process refund if applicable
    if (refundAmount > 0 && order.paymentStatus === 'Paid') {
      let wallet = await Wallet.findOne({ userID: userId });
      if (!wallet) {
        wallet = new Wallet({ userID: userId });
      }
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        description: `Refund for cancelled order item`,
        orderID: orderId
      });
      await wallet.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
};

const getWalletPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const wallet = await Wallet.findOne({ userID: userId });

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    if (!wallet) {
      return res.render('wallet', {
        wallet: { balance: 0, transactions: [] },
        cartCount: req.cartCount,
        currentPage: 1,
        totalPages: 1,
        totalTransactions: 0,
        limit
      });
    }

    const transactions = wallet.transactions.sort((a, b) => b.date - a.date);
    const paginatedTransactions = transactions.slice(startIndex, startIndex + limit);


    const transactionsWithOrders = await Promise.all(
      paginatedTransactions.map(async (transaction) => {
        if (transaction.orderID) {
          const order = await Order.findOne({ orderID: transaction.orderID });
          return { ...transaction.toObject(), order };
        }
        return transaction;
      })
    );


    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    res.render('wallet', {
      wallet: { ...wallet.toObject(), transactions: transactionsWithOrders },
      cartCount: req.cartCount,
      currentPage: page,
      totalPages,
      totalTransactions,
      limit
    });
  } catch (error) {
    console.error('Error loading wallet:', error);
    res.redirect('/pageNotFound');
  }
};


const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const productId = req.query.productId;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason for return is required' });
    }

    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Calculate per-item discount if a coupon was applied
    const itemCount = order.orderItems.length;
    const perItemDiscount = order.discount > 0 && itemCount > 0 ? order.discount / itemCount : 0;

    let refundAmount = 0;

    if (productId) {
      const item = order.orderItems.find(i => i.product._id.toString() === productId);
      if (!item || item.status === 'Returned') {
        return res.status(400).json({ success: false, message: 'Item not found or already returned' });
      }

      if (item.status !== 'Delivered') {
        return res.status(400).json({ success: false, message: 'Item must be delivered to return' });
      }

      item.status = 'Return Request';
      item.returnReason = reason;
      refundAmount = (item.price * item.quantity) - perItemDiscount;


    } else {
      for (const item of order.orderItems) {
        if (item.status === 'Delivered') {
          item.status = 'Return Request';
          item.returnReason = reason;
          refundAmount += (item.price * item.quantity) - perItemDiscount;


        }
      }
    }

    await order.save();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error returning order:', error);
    res.status(500).json({ success: false, message: 'Failed to return order' });
  }
};


const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const pdfBuffer = await generateInvoice(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${order.orderID}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to generate invoice' });
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const { addressIndex, couponCode } = req.body;
    const userId = req.session.user;

    const cart = await Cart.findOne({ userID: userId }).populate('item.productID');
    const addresses = await Address.findOne({ userID: userId });

    if (!cart || cart.item.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    if (!addresses || !addresses.address[addressIndex]) {
      return res.status(400).json({ success: false, message: 'Invalid address selected' });
    }

    const selectedAddress = addresses.address[addressIndex];
    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });

    const deliveryCharge = subtotal < 5000 ? DELIVERY_CHARGE : 0;
    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        name: couponCode,
        isList: true,
        expireOn: { $gt: new Date() },
      });
      if (coupon && subtotal >= coupon.minimumPrice) {
        discount = coupon.offerPrice;
      }
    }

    const totalPrice = subtotal + deliveryCharge;
    const finalAmount = totalPrice - discount;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = new Order({
      userID: userId,
      orderItems: cart.item.flatMap(item =>
        item.size.map(sizeItem => ({
          product: item.productID._id,
          quantity: sizeItem.quantity,
          size: sizeItem.size,
          price: item.price,
          status: 'Pending',
        }))
      ),
      totalPrice: subtotal,
      deliveryCharge,
      discount,
      finalAmount,
      address: {
        label: selectedAddress.label,
        street: selectedAddress.street,
        city: selectedAddress.city,
        state: selectedAddress.state,
        zipCode: selectedAddress.zipCode,
        country: selectedAddress.country,
        phone: selectedAddress.phone,
      },
      paymentMethod: 'Razorpay',
      invoiceNumber,
      couponApplied: !!couponCode,
      couponCode: couponCode || null,
      paymentStatus: 'Pending'
    });

    await order.save();

    await Cart.deleteOne({ userID: userId });

    const options = {
      amount: finalAmount * 100,
      currency: 'INR',
      receipt: `receipt_${order.orderID.slice(0, 35)}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      order: razorpayOrder,
      deliveryCharge,
      orderId: order.orderID
    });
  } catch (error) {
    console.error('Detailed error creating Razorpay order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found', orderId });
    }

    if (expectedSignature !== razorpay_signature) {
      order.paymentStatus = 'Failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature', orderId });
    }

    // Update payment status to Paid
    order.paymentStatus = 'Paid';
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();


    await updateStock(order.orderItems);

    res.status(200).json({ success: true, orderId: order.orderID });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const order = await Order.findOne({ orderID: req.body.orderId });
    if (order) {
      order.paymentStatus = 'Failed';
      await order.save();
    }
    res.status(500).json({ success: false, message: 'Failed to verify payment', orderId: req.body.orderId });
  }
};



const cancelRazorpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderID: orderId, userID: userId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus !== 'Pending' && order.paymentStatus !== 'Failed') {
      return res.status(400).json({ success: false, message: 'Payment cannot be cancelled' });
    }

    order.paymentStatus = 'Failed';
    await order.save();

    // for (const item of order.orderItems) {
    //   const product = await Product.findById(item.product);
    //   if (product) {
    //     const sizeVariant = product.size.find(s => s.size === item.size);
    //     if (sizeVariant) {
    //       sizeVariant.quantity += item.quantity;
    //       await product.save();
    //     }
    //   }
    // }

    res.status(200).json({ success: true, orderId });
  } catch (error) {
    console.error('Error cancelling Razorpay payment:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel payment', orderId: req.body.orderId });
  }
};



const retryRazorpayPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderID: orderId, userID: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    if (!['Pending', 'Failed'].includes(order.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Payment cannot be retried' });
    }

  
    if (order.paymentMethod === 'COD') {
      order.paymentMethod = 'Razorpay';
      await order.save();
    }


    order.paymentStatus = 'Failed';
    await order.save();

    const options = {
      amount: order.finalAmount * 100,
      currency: 'INR',
      receipt: `rcpt_${order.orderID.slice(0, 35)}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      order: razorpayOrder,
      orderId: order.orderID,
    });
  } catch (error) {
    console.error('Error retrying Razorpay payment:', error);
    res.status(500).json({
      success: false,
      message: error.error?.description || 'Failed to initiate payment',
    });
  }
};


const payNow = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderID: orderId, userID: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus !== 'Pending' || order.paymentMethod !== 'COD') {
      return res.status(400).json({ success: false, message: 'Payment not applicable for this order' });
    }

    const options = {
      amount: order.finalAmount * 100,
      currency: 'INR',
      receipt: `paynow_${order.orderID.slice(0, 35)}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      order: razorpayOrder,
      orderId: order.orderID,
    });
  } catch (error) {
    console.error('Error initiating Pay Now payment:', error);
    res.status(500).json({
      success: false,
      message: error.error?.description || 'Failed to initiate payment',
    });
  }
};

const verifyPayNowPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.session.user;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const order = await Order.findOne({ orderID: orderId, userID: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found', orderId });
    }

    if (expectedSignature !== razorpay_signature) {
      order.paymentStatus = 'Failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature', orderId });
    }

    order.paymentStatus = 'Paid';
    order.paymentMethod = 'Razorpay'; 
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    res.status(200).json({ success: true, orderId: order.orderID });
  } catch (error) {
    console.error('Error verifying Pay Now payment:', error);
    const order = await Order.findOne({ orderID: req.body.orderId });
    if (order) {
      order.paymentStatus = 'Failed';
      await order.save();
    }
    res.status(500).json({ success: false, message: 'Failed to verify payment', orderId: req.body.orderId });
  }
};


const createWalletTopup = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `wallet_topup_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error creating wallet top-up order:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate top-up' });
  }
};

const verifyWalletTopup = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.session.user;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    let wallet = await Wallet.findOne({ userID: userId });
    if (!wallet) {
      wallet = new Wallet({ userID: userId });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      type: 'credit',
      amount,
      description: 'Wallet top-up via Razorpay',
      orderID: null
    });

    await wallet.save();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error verifying wallet top-up:', error);
    res.status(500).json({ success: false, message: 'Failed to verify top-up' });
  }
};




const getPaymentFailurePage = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    let order = null;

    if (orderId) {
      const userId = req.session.user?._id || req.session.user;
      order = await Order.findOne({ orderID: orderId, userID: userId })
        .populate('orderItems.product') 
        .lean(); 

      if (!order || !['Pending', 'Failed'].includes(order.paymentStatus)) {
        order = null;
      }
    }

    if (order) {
     
      const templateData = {
        orderId: order.orderID,
        orderTotal: order.finalAmount, 
        discount: order.discount || 0, 
        deliveryCharge: order.deliveryCharge || 0,
        items: order.orderItems.map(item => ({
          product: {
            productName: item.product?.productName,
            productImage: item.product?.productImage,
            color: item.product?.color,
          },
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        })),
        address: {
          label: order.address.label,
          street: order.address.street,
          city: order.address.city,
          state: order.address.state,
          zipCode: order.address.zipCode,
          country: order.address.country,
          phone: order.address.phone,
        },
        customerEmail: req.session.user?.email, 
      };

      res.render('payment-failure', templateData);
    } else {
      res.render('payment-failure', { orderId: null });
    }
  } catch (error) {
    console.error('Error fetching payment failure page:', error);
    res.status(500).render('error', { message: 'Server Error' });
  }
};


module.exports = {
  getCheckoutPage,
  placeOrder,
  getOrderSuccessPage,
  getOrdersPage,
  getOrderDetailsPage,
  cancelOrder,
  returnOrder,
  applyCoupon,
  removeCoupon,
  downloadInvoice,
  getWalletPage,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createWalletTopup,
  verifyWalletTopup,
  retryRazorpayPayment,
  getPaymentFailurePage,
  cancelRazorpayPayment,
  payNow,
  verifyPayNowPayment

};