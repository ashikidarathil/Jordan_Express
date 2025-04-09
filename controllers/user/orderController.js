
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const { generateInvoice } = require('../../services/invoiceService');


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
    const shipping = 0;
    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        name: couponCode,
        isList: true,
        expireOn: { $gt: new Date() }
      });
      if (coupon && subtotal >= coupon.minimumPrice) {
        discount = coupon.offerPrice;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid or inapplicable coupon' });
      }
    }

    const totalPrice = subtotal + shipping;
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
          status: 'Pending'
        }))
      ),
      totalPrice,
      discount,
      finalAmount,
      address: {
        label: selectedAddress.label,
        street: selectedAddress.street,
        city: selectedAddress.city,
        state: selectedAddress.state,
        zipCode: selectedAddress.zipCode,
        country: selectedAddress.country,
        phone: selectedAddress.phone
      },
      paymentMethod,
      invoiceNumber,
      couponApplied: !!couponCode,
      couponCode: couponCode || null
    });

    await order.save();

    for (const item of cart.item) {
      const product = await Product.findById(item.productID._id);
      item.size.forEach(sizeItem => {
        const productSize = product.size.find(s => s.size === sizeItem.size);
        if (productSize) {
          productSize.quantity -= sizeItem.quantity;
        }
      });
      await product.save();
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
    const cart = await Cart.findOne({ userID: userId }).populate('item.productID');
    const addresses = await Address.findOne({ userID: userId });
    const user = await User.findById(userId);
    const coupons = await Coupon.find({ isList: true, expireOn: { $gt: new Date() } });

    if (!cart || cart.item.length === 0) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });
    const shipping = 0;
    const discount = 0;
    const total = subtotal + shipping - discount;

    // Filter coupons based on minimum purchase amount
    const applicableCoupons = coupons.filter(coupon => subtotal >= coupon.minimumPrice);

    res.render('checkout', {
      addresses: addresses || { address: [] },
      cartItems: cart.item,
      subtotal,
      discount,
      total,
      cartCount: req.cartCount,
      user,
      coupons: applicableCoupons // Pass only applicable coupons
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
    const total = subtotal - discount;

    res.status(200).json({
      success: true,
      discount,
      total,
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
    const total = subtotal;

    res.status(200).json({
      success: true,
      discount,
      total
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
    const searchQuery = req.query.search ? req.query.search.trim() : ''; // Get search query from URL

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

    // Calculate per-item discount if a coupon was applied
    const itemCount = order.orderItems.length;
    const perItemDiscount = order.discount > 0 && itemCount > 0 ? order.discount / itemCount : 0;

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
      refundAmount = (item.price * item.quantity) - perItemDiscount; // Subtract per-item discount
      itemsToCancel.push(item);

      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === item.size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        await product.save();
      }
    } else {
      for (const item of order.orderItems) {
        if (['Pending', 'Processing'].includes(item.status)) {
          item.status = 'Cancelled';
          item.cancellationReason = reason || 'No reason provided';
          refundAmount += (item.price * item.quantity) - perItemDiscount; // Subtract per-item discount
          itemsToCancel.push(item);

          const product = await Product.findById(item.product);
          const sizeVariant = product.size.find(s => s.size === item.size);
          if (sizeVariant) {
            sizeVariant.quantity += item.quantity;
            await product.save();
          }
        }
      }
    }

    await order.save();

    if (refundAmount > 0) {
      let wallet = await Wallet.findOne({ userID: userId });
      if (!wallet) {
        wallet = new Wallet({ userID: userId });
      }
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        description: `Refund for cancelled order${productId ? ' item' : ''}`,
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

    if (!wallet) {
      return res.render('wallet', {
        wallet: { balance: 0, transactions: [] },
        cartCount: req.cartCount
      });
    }

    // Optionally fetch order details for each transaction
    const transactionsWithOrders = await Promise.all(
      wallet.transactions.map(async (transaction) => {
        if (transaction.orderID) {
          const order = await Order.findOne({ orderID: transaction.orderID });
          return { ...transaction.toObject(), order };
        }
        return transaction;
      })
    );

    res.render('wallet', {
      wallet: { ...wallet.toObject(), transactions: transactionsWithOrders },
      cartCount: req.cartCount
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
      refundAmount = (item.price * item.quantity) - perItemDiscount; // Subtract per-item discount

      // Note: Stock is increased here, but refund happens in admin's verifyReturnRequest
    } else {
      for (const item of order.orderItems) {
        if (item.status === 'Delivered') {
          item.status = 'Return Request';
          item.returnReason = reason;
          refundAmount += (item.price * item.quantity) - perItemDiscount; // Subtract per-item discount

          const product = await Product.findById(item.product);
          const sizeVariant = product.size.find(s => s.size === item.size);
          if (sizeVariant) {
            sizeVariant.quantity += item.quantity;
            await product.save();
          }
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
  getWalletPage
};