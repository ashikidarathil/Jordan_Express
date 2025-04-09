const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');

const getAdminOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || '-createdOn';
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';

    // Build query
    let query = {};
    if (search) {
      query.$or = [
        { orderID: { $regex: search, $options: 'i' } },
        { 'userID.email': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .populate('userID', 'name email')
      .populate('orderItems.product')
      .sort(sort);

    // Flatten orders into a list of items
    const orderItems = [];
    orders.forEach(order => {
      order.orderItems.forEach(item => {
        orderItems.push({
          orderID: order.orderID,
          createdOn: order.createdOn,
          user: order.userID,
          item: item,
          paymentMethod: order.paymentMethod
        });
      });
    });

    // Apply status filter to items
    let filteredItems = orderItems;
    if (statusFilter) {
      filteredItems = orderItems.filter(item => item.item.status === statusFilter);
    }

    // Pagination
    const totalItems = filteredItems.length;
    const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit);

    res.render('admin-orders', {
      orderItems: paginatedItems,
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
      sort,
      search,
      statusFilter,
      limit
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderID: orderId })
      .populate('userID', 'name email')
      .populate('orderItems.product');

    if (!order) {
      return res.status(404).render('admin/error', { message: 'Order not found' });
    }

    res.render('admin-order-details', {
      order,
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};

const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, status } = req.body;

    const order = await Order.findOne({ orderID: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Return Request', 'Return Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const orderItem = order.orderItems.find(item =>
      item.product.toString() === productId && item.size === size
    );

    if (!orderItem) {
      return res.status(404).json({ success: false, message: 'Order item not found' });
    }

    if (orderItem.status === 'Delivered' && status === 'Shipped') {
      return res.status(400).json({ success: false, message: 'Cannot revert to Shipped after Delivered' });
    }

    orderItem.status = status;

    if (status === 'Cancelled' || status === 'Returned') {
      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += orderItem.quantity;
        await product.save();
      }
    }

    await order.save();

    return res.json({ success: true, message: 'Product status updated successfully' });
  } catch (error) {
    console.error('Error updating product status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, action } = req.body;

    const order = await Order.findOne({ orderID: orderId }).populate('userID');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderItems.find(i =>
      i.product.toString() === productId && i.size === size
    );

    if (!item || item.status !== 'Return Request') {
      return res.status(400).json({ success: false, message: 'Item not found or not eligible for return' });
    }

    if (action === 'accept') {
      item.status = 'Returned';
      const itemCount = order.orderItems.length;
      const perItemDiscount = order.discount > 0 && itemCount > 0 ? order.discount / itemCount : 0;
      const refundAmount = (item.price * item.quantity) - perItemDiscount;

      // Refund to user's wallet
      let wallet = await Wallet.findOne({ userID: order.userID });
      if (!wallet) {
        wallet = new Wallet({ userID: order.userID });
      }
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        description: item.returnReason,
        orderID: orderId
      });
      await wallet.save();

      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        await product.save();
      }
    } else if (action === 'reject') {
      item.status = 'Return Rejected';
    }

    await order.save();

    res.json({ success: true, message: `Return request ${action}ed` });
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(500).json({ success: false, message: 'Failed to process return' });
  }
};


// const getUserWallets = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 10;
//     const wallets = await Wallet.find()
//       .populate('userID', 'name email')
//       .skip((page - 1) * limit)
//       .limit(limit);
//     const totalWallets = await Wallet.countDocuments();
//     const totalPages = Math.ceil(totalWallets / limit);

//     res.render('admin-wallets', {
//       wallets,
//       currentPage: page,
//       totalPages
//     });
//   } catch (error) {
//     console.error('Error fetching wallets:', error);
//     res.status(500).render('admin/error', { message: 'Server Error' });
//   }
// };

module.exports = {
  getAdminOrders,
  getOrderDetails,
  updateOrderItemStatus,
  verifyReturnRequest,
  
};