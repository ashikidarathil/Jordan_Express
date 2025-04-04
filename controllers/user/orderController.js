// controllers/user/orderController.js
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const { generateInvoice } = require('../../services/invoiceService');
const { login } = require('./userController');

const placeOrder = async (req, res) => {
  try {
    const { addressIndex, paymentMethod } = req.body;
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
    const discount = 0;
    const totalPrice = subtotal + shipping - discount;

    // Generate unique invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = new Order({
      userID: userId,
      orderItems: cart.item.map(item => ({
        product: item.productID._id,
        quantity: item.size[0].quantity,
        size: item.size[0].size,
        price: item.price
      })),
      totalPrice: totalPrice,
      finalAmount: totalPrice,
      address: {
        label: selectedAddress.label,
        street: selectedAddress.street,
        city: selectedAddress.city,
        state: selectedAddress.state,
        zipCode: selectedAddress.zipCode,
        country: selectedAddress.country,
        phone: selectedAddress.phone
      },
      paymentMethod: paymentMethod,
      status: 'Pending',
      invoiceNumber: invoiceNumber 
    });

    await order.save();

    // Update product stock
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

    // Clear cart
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

    if (!cart || cart.item.length === 0) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    cart.item.forEach(item => {
      subtotal += item.totalPrice;
    });
    const discount = 0;
    const shipping = 0;
    const total = subtotal + shipping - discount;

    res.render('checkout', {
      addresses: addresses || { address: [] },
      cartItems: cart.item,
      subtotal,
      discount,
      total,
      cartCount: req.cartCount,
      user: user // Pass user object to template
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/pageNotFound');
  }
};

const getOrderSuccessPage = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch the complete order details using the orderID (UUID) field
    const order = await Order.findOne({ orderID: orderId })
      .populate('userID', 'email')
      .populate('orderItems.product');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('order-success', {
      orderId: order.orderID, // using the UUID
      orderDate: order.createdOn.toLocaleDateString(),
      orderTotal: order.finalAmount,
      paymentMethod: order.paymentMethod,
      customerEmail: order.userID.email,
      items: order.orderItems,
      address: order.address, // make sure your order has address data
      cartCount: req.cartCount || 0,
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
    const limit = 5; // Number of orders per page
    
    const totalOrders = await Order.countDocuments({ userID: userId });
    const totalPages = Math.ceil(totalOrders / limit);
    
    const orders = await Order.find({ userID: userId })
      .populate('orderItems.product')
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.render('orders', { 
      orders, 
      cartCount: req.cartCount,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error('Error loading orders:', error);
    res.redirect('/pageNotFound');
  }
};


const getOrderDetailsPage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const orders = await Order.findOne({ orderID: orderId }).populate('orderItems.product');


    if (!orders) {
      return res.redirect('/pageNotFound');
    }
    res.render('order-details', { orders });
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

    const order = await Order.findOne({ orderID: orderId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (productId) {
      // Cancel specific item
      const item = order.orderItems.find(i => i.product._id.toString() === productId);
      if (!item || item.status === 'Cancelled') {
        return res.status(400).json({ success: false, message: 'Item not found or already cancelled' });
      }

      if (!['Pending', 'Processing','Partially Cancelled'].includes(order.status)) {
        return res.status(400).json({ success: false, message: 'Cannot cancel item at this stage' });
      }

      item.status = 'Cancelled';
      item.cancellationReason = reason || 'No reason provided';

      const product = await Product.findById(productId);
  
      const sizeVariant = product.size.find(s => s.size === item.size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        
        await product.save();
      }


      
      

    } else {
      // Cancel entire order
      if (!['Pending', 'Processing'].includes(order.status)) {
        return res.status(400).json({ success: false, message: 'Cannot cancel order at this stage' });
      }

      for (const item of order.orderItems) {
        if (item.status !== 'Cancelled') {
          item.status = 'Cancelled';
          item.cancellationReason = reason || 'No reason provided';

          const product = await Product.findById(item.product);
          
          const sizeVariant = product.size.find(s => s.size === item.size);
          if (sizeVariant) {
            sizeVariant.quantity += item.quantity;
            
            await product.save();
           
          }
        }
      }
    }

    // Update overall order status
    const itemStatuses = order.orderItems.map(i => i.status);
    if (itemStatuses.every(s => s === 'Cancelled')) {
      order.status = 'Cancelled';
    } else if (itemStatuses.some(s => s === 'Cancelled')) {
      order.status = 'Partially Cancelled';
    }

    await order.save();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
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

    if (order.status !== 'Delivered' &&order.status !== 'Partially Returned'&&order.status !== 'Partially Cancelled' ) {
      return res.status(400).json({ success: false, message: 'Order must be delivered to return' });
    }

    if (productId) {
      // Return specific item
      const item = order.orderItems.find(i => i.product._id.toString() === productId);
      if (!item || item.status === 'Returned') {
        return res.status(400).json({ success: false, message: 'Item not found or already returned' });
      }

      item.status = 'Return Request';
      item.returnReason = reason;

      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === item.size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        await product.save();
      }
    } else {
      // Return entire order
      for (const item of order.orderItems) {
        if (item.status !== 'Returned') {
          item.status = 'Return Request';
          item.returnReason = reason;

          const product = await Product.findById(item.product);
          const sizeVariant = product.size.find(s => s.size === item.size);
          if (sizeVariant) {
            sizeVariant.quantity += item.quantity;
            await product.save();
          }
        }
      }
    }

    // Update overall order status
    const itemStatuses = order.orderItems.map(i => i.status);
    if (itemStatuses.every(s => s === 'Returned')) {
      order.status = 'Returned';
    } else if (itemStatuses.some(s => s === 'Returned')) {
      order.status = 'Partially Returned';
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
  downloadInvoice
};