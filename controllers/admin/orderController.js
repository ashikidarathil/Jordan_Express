// controllers/admin/orderController.js
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');

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
    
    if (statusFilter) {
      query.status = statusFilter;
    }

    const totalOrders = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('userID', 'name email')
      .populate('orderItems.product')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    res.render('admin-orders', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
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

    // Set default status for items that don't have one
    order.orderItems.forEach(item => {
      if (!item.status) {
        item.status = order.status;
      }
    });

    res.render('admin-order-details', { 
      order,
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).render('admin/error', { message: 'Server Error' });
  }
};



const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params.orderId;
    const { status } = req.body;

    const order = await Order.findOne({ orderID: orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Validate status
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Special handling for certain status changes
    if (status === 'Cancelled') {
      // Update all items to cancelled
      order.orderItems.forEach(item => {
        if (item.status !== 'Cancelled' && item.status !== 'Returned') {
          item.status = 'Cancelled';
        }
      });
    } else if (status === 'Processing') {
      // Can't go back to Processing from more advanced states
      if (['Shipped', 'Delivered'].includes(order.status)) {
        return res.status(400).json({ success: false, message: 'Cannot revert to Processing' });
      }
    }

    order.status = status;
    await order.save();

    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};


const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, status } = req.body;

    console.log("Request params:", orderId, productId, size, status);

    // First, find the order - make sure case matches your schema
    const order = await Order.findOne({ orderID: orderId });
    console.log("Found order:", order ? order._id : "not found");
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if status is valid from your enum (schema)
    const validStatuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Return Request'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Find the specific item
    const orderItem = order.orderItems.find(item => 
      item.product.toString() === productId && item.size === size
    );
    console.log("Found item:", orderItem ? "yes" : "no");

    if (!orderItem) {
      return res.status(404).json({ success: false, message: 'Order item not found' });
    }

    // Status transition validation
    if (orderItem.status === 'Delivered' && status === 'Shipped') {
      return res.status(400).json({ success: false, message: 'Cannot revert to Shipped after Delivered' });
    }

    // Update the status
    orderItem.status = status;
    
    // Update product stock if cancelled or returned
    if (status === 'Cancelled' || status === 'Returned') {
      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += orderItem.quantity;
        await product.save();
      }
    }

    // Determine overall order status
    await updateOverallOrderStatus(order);
    await order.save();

    return res.json({ success: true, message: 'Product status updated successfully' });
  } catch (error) {
    console.error('Error updating product status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};



async function updateOverallOrderStatus(order) {
  const itemStatuses = order.orderItems.map(i => i.status);
  
  if (itemStatuses.every(s => s === 'Cancelled')) {
    order.status = 'Cancelled';
  } else if (itemStatuses.some(s => s === 'Cancelled')) {
    order.status = 'Partially Cancelled';
  } else if (itemStatuses.every(s => s === 'Returned')) {
    order.status = 'Returned';
  } else if (itemStatuses.some(s => s === 'Returned' || s === 'Return Requested')) {
    order.status = 'Partially Returned';
  } else if (itemStatuses.every(s => s === 'Delivered')) {
    order.status = 'Delivered';
  } else if (itemStatuses.some(s => s === 'Shipped')) {
    order.status = 'Shipped';
  } else if (itemStatuses.some(s => s === 'Processing')) {
    order.status = 'Processing';
  } else {
    order.status = 'Pending';
  }
} 


const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, size, action } = req.body;

    const order = await Order.findOne({ orderID: orderId });
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
      // Restock the product
      const product = await Product.findById(productId);
      const sizeVariant = product.size.find(s => s.size === size);
      if (sizeVariant) {
        sizeVariant.quantity += item.quantity;
        await product.save();
      }
    } else if (action === 'reject') {
      item.status = 'Return Rejected';
    }

    await updateOverallOrderStatus(order);
    await order.save();

    res.json({ success: true, message: `Return request ${action}ed` });
  } catch (error) {
    console.error('Error processing return:', error);
    res.status(500).json({ success: false, message: 'Failed to process return' });
  }
};




module.exports = { 
  getAdminOrders ,
  getOrderDetails,
  updateOrderStatus,
  updateOrderItemStatus,
  verifyReturnRequest

};